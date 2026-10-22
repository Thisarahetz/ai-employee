import { Injectable, Logger } from '@nestjs/common';
import { AgentType, AiProviderName, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { platformDefaultModel } from '../ai-provider/ai-provider.service';
import { platformKeysAllowed } from '../ai-provider/provider-keys.service';

export interface SetupProblem {
  /** Stable id, used so the same problem only alerts owners once in a while. */
  code: string;
  /** What is wrong, in plain words. */
  message: string;
  /** Where in the app the owner fixes it. */
  href: string;
}

export const SETUP_PROBLEM_NOTIFICATION = 'ai_workforce.setup_problem';
/** The same problem alerts owners at most once in this window. */
const ALERT_EVERY_MS = 6 * 3600e3;

const PLATFORM_ENV_KEY: Record<AiProviderName, string> = {
  OPENAI: 'OPENAI_API_KEY',
  ANTHROPIC: 'ANTHROPIC_API_KEY',
  GEMINI: 'GEMINI_API_KEY',
};
const PROVIDER_LABEL: Record<AiProviderName, string> = { OPENAI: 'OpenAI', ANTHROPIC: 'Anthropic', GEMINI: 'Gemini' };

export const SETUP_BLOCKED_PREFIX = 'Not run because the setup is incomplete:';

/** Turns a problem list into one sentence for run logs and task errors. */
export function describeProblems(problems: SetupProblem[]): string {
  return `${SETUP_BLOCKED_PREFIX} ${problems.map((p) => p.message).join(' ')}`;
}

/**
 * Checks the setup a workflow depends on is still in place and working
 * before it runs: the AI key, the business details, the assigned AI employee
 * and (for integration events) the integration. If anything is missing or
 * broken the workflow is not run and the owners are told what to fix.
 */
@Injectable()
export class SetupCheckService {
  private readonly logger = new Logger(SetupCheckService.name);

  constructor(private readonly prisma: PrismaService) {}

  async check(
    tenantId: string,
    opts: { employeeId?: string | null; integrationId?: string | null; needsAi?: boolean; needsBusiness?: boolean } = {},
  ): Promise<SetupProblem[]> {
    const problems: SetupProblem[] = [];
    if (opts.needsAi !== false) {
      const ai = await this.aiKeyProblem(tenantId);
      if (ai) problems.push(ai);
    }

    const business = opts.needsBusiness === false ? undefined : await this.prisma.business.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: { profile: true },
    });
    if (business === null) {
      problems.push({ code: 'business_missing', message: 'The business details have been removed.', href: '/business-setup' });
    } else if (business) {
      const description = ((business.profile ?? {}) as { description?: string }).description?.trim();
      if (!description) {
        problems.push({
          code: 'business_profile_missing',
          message: 'The business description is empty, so AI employees do not know what the business does.',
          href: '/business-setup',
        });
      }
    }

    if (opts.employeeId !== undefined) {
      const employee = opts.employeeId
        ? await this.prisma.aiEmployee.findFirst({ where: { id: opts.employeeId, tenantId }, select: { name: true, status: true } })
        : null;
      if (!employee) {
        problems.push({ code: 'employee_missing', message: 'The AI employee assigned to this work has been removed.', href: '/ai-employees' });
      } else if (employee.status !== 'ACTIVE') {
        problems.push({ code: `employee_paused:${opts.employeeId}`, message: `${employee.name} is paused.`, href: '/ai-employees' });
      }
    }

    if (opts.integrationId) {
      const integration = await this.prisma.integration.findFirst({
        where: { id: opts.integrationId, tenantId },
        select: { name: true, status: true },
      });
      if (!integration) {
        problems.push({ code: 'integration_missing', message: 'The connected system this work relies on has been removed.', href: '/integrations' });
      } else if (integration.status === 'ERROR') {
        // DISCONNECTED only means "not tested yet"; a signed event from it shows it works.
        problems.push({ code: `integration_down:${opts.integrationId}`, message: `${integration.name} is not working.`, href: '/integrations' });
      }
    }
    return problems;
  }

  /**
   * Tells every owner/admin what stopped and how to fix it. Each problem is
   * sent at most once every 6 hours, so a schedule or busy event stream does
   * not flood the bell.
   */
  async alertOwners(tenantId: string, problems: SetupProblem[], workflow: string): Promise<void> {
    const since = new Date(Date.now() - ALERT_EVERY_MS);
    for (const p of problems) {
      try {
        const recent = await this.prisma.notification.findFirst({
          where: { tenantId, type: SETUP_PROBLEM_NOTIFICATION, createdAt: { gte: since }, metadata: { path: ['code'], equals: p.code } },
          select: { id: true },
        });
        if (recent) continue;
        const owners = await this.prisma.tenantMembership.findMany({
          where: { tenantId, status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN'] } },
          select: { userId: true },
        });
        if (!owners.length) continue;
        await this.prisma.notification.createMany({
          data: owners.map((o) => ({
            tenantId,
            userId: o.userId,
            type: SETUP_PROBLEM_NOTIFICATION,
            title: 'AI work stopped: setup needs fixing'.slice(0, 200),
            body: `${p.message} "${workflow}" did not run, and other AI work will wait until this is fixed.`.slice(0, 4000),
            metadata: { code: p.code, href: p.href, workflow } as Prisma.InputJsonValue,
          })),
        });
      } catch (err) {
        this.logger.warn(`Could not alert owners of tenant ${tenantId} about ${p.code}: ${(err as Error).message}`);
      }
    }
  }

  /** Same provider choice as AiProviderService, then: is there a usable key for it? */
  private async aiKeyProblem(tenantId: string): Promise<SetupProblem | null> {
    const agent = await this.prisma.aiAgent.findUnique({
      where: { tenantId_type: { tenantId, type: AgentType.ACTION } },
      include: { configuration: true },
    });
    const provider = agent?.configuration?.provider ?? platformDefaultModel().provider;
    const label = PROVIDER_LABEL[provider];
    const own = await this.prisma.tenantAiProviderKey.findFirst({ where: { tenantId, provider }, select: { lastError: true } });
    if (own?.lastError) {
      return { code: `ai_key_rejected:${provider}`, message: `Your ${label} API key was rejected by ${label}.`, href: '/ai-configuration' };
    }
    if (own) return null;
    if (platformKeysAllowed() && process.env[PLATFORM_ENV_KEY[provider]]?.trim()) return null;
    return { code: `ai_key_missing:${provider}`, message: `No ${label} API key is set up.`, href: '/ai-configuration' };
  }
}
