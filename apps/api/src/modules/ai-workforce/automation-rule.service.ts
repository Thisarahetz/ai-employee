import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { WorkforceTaskService } from './workforce-task.service';
import {
  RuleCondition,
  RuleInput,
  RuleValidationError,
  allConditionsMatch,
  compactPayload,
  normalizeRuleInput,
  renderTemplate,
} from './automation-rules';
import { RULE_TRIGGER_EVENTS } from '../../events/external-event-policy';

type Rule = Prisma.AiAutomationRuleGetPayload<object>;

/** Max automation rules per business (keeps evaluation cheap and bounded). */
export const MAX_RULES_PER_TENANT = 100;

/**
 * Event-driven work: listens to every business event and, for each enabled
 * rule whose trigger and conditions match, creates a task for the chosen AI
 * employee (or notifies the owner).
 *
 * Safeguards: per-rule hourly cap, cooldown per dedupe key, the tenant's
 * daily task cap and budget (via task creation), and events caused by AI
 * tasks are ignored unless the rule opts in — so rules can't loop.
 */
@Injectable()
export class AutomationRuleService implements OnModuleInit {
  private readonly logger = new Logger(AutomationRuleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly tasks: WorkforceTaskService,
    private readonly emitter: EventEmitter2,
  ) {}

  onModuleInit() {
    this.emitter.onAny((event: string | string[], payload: unknown) => {
      const type = Array.isArray(event) ? event.join('.') : event;
      const p = payload as Record<string, unknown> | undefined;
      if (!p || typeof p.tenantId !== 'string') return;
      this.handleEvent(type, p).catch((err) => this.logger.error(`Automation dispatch for "${type}" failed: ${(err as Error).message}`));
    });
  }

  // ── CRUD ────────────────────────────────────────────────────────────────

  triggerCatalog() {
    return { builtIn: RULE_TRIGGER_EVENTS, externalPattern: 'any "noun.verb" event your connected systems send, e.g. order.refunded' };
  }

  list(tenantId: string) {
    return this.prisma.aiAutomationRule.findMany({
      where: { tenantId },
      include: { employee: { select: { id: true, name: true, role: true, status: true } } },
      orderBy: [{ enabled: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async get(tenantId: string, id: string) {
    const r = await this.prisma.aiAutomationRule.findFirst({
      where: { id, tenantId },
      include: { employee: { select: { id: true, name: true, role: true, status: true } } },
    });
    if (!r) throw new NotFoundException('Automation rule not found');
    return r;
  }

  runs(tenantId: string, id: string, limit = 50) {
    return this.prisma.aiAutomationRun.findMany({
      where: { tenantId, ruleId: id },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
    });
  }

  async create(tenantId: string, userId: string, input: RuleInput, extra: { templateKey?: string } = {}) {
    const count = await this.prisma.aiAutomationRule.count({ where: { tenantId } });
    if (count >= MAX_RULES_PER_TENANT) throw new BadRequestException(`A business can have at most ${MAX_RULES_PER_TENANT} automation rules.`);
    const data = this.normalize(input, true);
    await this.assertEmployee(tenantId, data.actionType as string, data.employeeId as string | null | undefined);
    const rule = await this.prisma.aiAutomationRule.create({
      data: { ...(data as Prisma.AiAutomationRuleUncheckedCreateInput), tenantId, createdByUserId: userId || null, templateKey: extra.templateKey ?? null },
    });
    await this.audit.record(tenantId, userId || undefined, 'ai_automation.created', 'AiAutomationRule', rule.id, { name: rule.name, triggerEvent: rule.triggerEvent });
    return rule;
  }

  async update(tenantId: string, userId: string, id: string, input: RuleInput) {
    const existing = await this.get(tenantId, id);
    const data = this.normalize(input, false);
    const actionType = (data.actionType as string | undefined) ?? existing.actionType;
    const employeeId = data.employeeId !== undefined ? (data.employeeId as string | null) : existing.employeeId;
    await this.assertEmployee(tenantId, actionType, employeeId);
    const rule = await this.prisma.aiAutomationRule.update({ where: { id }, data: { ...data, ...(data.enabled ? { lastError: null } : {}) } });
    await this.audit.record(tenantId, userId, 'ai_automation.updated', 'AiAutomationRule', id, { changes: input });
    return rule;
  }

  async remove(tenantId: string, userId: string, id: string) {
    const r = await this.get(tenantId, id);
    await this.prisma.aiAutomationRule.delete({ where: { id } });
    await this.audit.record(tenantId, userId, 'ai_automation.deleted', 'AiAutomationRule', id, { name: r.name });
    return { deleted: true };
  }

  /** Dry run: would this rule fire for `payload`, and what would it create? Nothing is executed. */
  async test(tenantId: string, id: string, payload: Record<string, unknown>) {
    const rule = await this.get(tenantId, id);
    const event = { ...(payload ?? {}), tenantId };
    const conditions = (rule.conditions ?? []) as unknown as RuleCondition[];
    const results = conditions.map((c) => ({ ...c, matched: allConditionsMatch([c], event) }));
    return {
      matches: results.every((r) => r.matched),
      conditions: results,
      title: renderTemplate(rule.taskTitle, event),
      description: renderTemplate(rule.taskDescription, event, 1000),
      dedupeValue: rule.dedupeKey ? renderTemplate(rule.dedupeKey, event) : null,
    };
  }

  private normalize(input: RuleInput, creating: boolean) {
    try {
      return normalizeRuleInput(input ?? {}, creating);
    } catch (err) {
      if (err instanceof RuleValidationError) throw new BadRequestException(err.message);
      throw err;
    }
  }

  private async assertEmployee(tenantId: string, actionType: string, employeeId: string | null | undefined) {
    if (actionType !== 'CREATE_TASK') return;
    if (!employeeId) throw new BadRequestException('Choose the AI employee who should handle this.');
    const e = await this.prisma.aiEmployee.findFirst({ where: { id: employeeId, tenantId }, select: { id: true } });
    if (!e) throw new NotFoundException('AI employee not found');
  }

  // ── Event handling ──────────────────────────────────────────────────────

  async handleEvent(type: string, payload: Record<string, unknown>): Promise<number> {
    const tenantId = payload.tenantId as string;
    const rules = await this.prisma.aiAutomationRule.findMany({ where: { tenantId, triggerEvent: type, enabled: true } });
    if (!rules.length) return 0;
    let fired = 0;
    for (const rule of rules) {
      try {
        if (await this.fire(rule, type, payload)) fired++;
      } catch (err) {
        const message = (err as Error).message.slice(0, 500);
        this.logger.warn(`Rule ${rule.id} failed on ${type}: ${message}`);
        await this.recordRun(rule, type, null, 'FAILED', message);
        await this.prisma.aiAutomationRule.update({ where: { id: rule.id }, data: { lastError: message } });
      }
    }
    return fired;
  }

  private async fire(rule: Rule, type: string, payload: Record<string, unknown>): Promise<boolean> {
    if (payload.causedByTaskId && !rule.allowAiTriggered) return false; // loop guard, silent
    if (!allConditionsMatch((rule.conditions ?? []) as unknown as RuleCondition[], payload)) return false;
    const dedupeValue = rule.dedupeKey ? renderTemplate(rule.dedupeKey, payload) || null : null;

    // Serialise per rule so concurrent events can't both pass the cooldown/rate checks.
    const verdict = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'aiw-rule:' + rule.id}))`;
      const hourAgo = new Date(Date.now() - 3600e3);
      const firedLastHour = await tx.aiAutomationRun.count({
        where: { ruleId: rule.id, createdAt: { gte: hourAgo }, status: { in: ['TASK_CREATED', 'NOTIFIED', 'PENDING'] } },
      });
      if (firedLastHour >= rule.maxRunsPerHour) return { skip: 'SKIPPED_RATE_LIMIT', message: `Hourly limit of ${rule.maxRunsPerHour} reached.` };
      if (rule.cooldownSeconds > 0) {
        const recent = await tx.aiAutomationRun.findFirst({
          where: {
            ruleId: rule.id,
            dedupeValue,
            status: { in: ['TASK_CREATED', 'NOTIFIED', 'PENDING'] },
            createdAt: { gte: new Date(Date.now() - rule.cooldownSeconds * 1000) },
          },
          select: { id: true },
        });
        if (recent) return { skip: 'SKIPPED_COOLDOWN', message: 'Already handled recently for the same key.' };
      }
      const run = await tx.aiAutomationRun.create({ data: { tenantId: rule.tenantId, ruleId: rule.id, eventType: type, dedupeValue, status: 'PENDING' } });
      return { runId: run.id };
    });

    if ('skip' in verdict) {
      // Don't let a noisy event stream fill the run log with skips.
      const skips = await this.prisma.aiAutomationRun.count({ where: { ruleId: rule.id, status: verdict.skip, createdAt: { gte: new Date(Date.now() - 3600e3) } } });
      if (skips < 20) await this.recordRun(rule, type, dedupeValue, verdict.skip!, verdict.message!);
      return false;
    }

    const title = renderTemplate(rule.taskTitle, payload) || rule.name;
    const description = renderTemplate(rule.taskDescription, payload, 1000);
    try {
      if (rule.actionType === 'NOTIFY_OWNER') {
        await this.tasks.notifyOwners(rule.tenantId, {
          type: 'ai_workforce.automation',
          title,
          body: description || `Triggered by ${type}.`,
          metadata: { ruleId: rule.id, eventType: type },
        });
        await this.finishRun(verdict.runId, rule, 'NOTIFIED', null, 'Owner notified.');
        return true;
      }
      const { tasks } = await this.tasks.createTasks(rule.tenantId, rule.createdByUserId ?? '', {
        employeeIds: [rule.employeeId!],
        title,
        description: [description, `(Started automatically by the rule "${rule.name}" when ${type} happened.)`].filter(Boolean).join('\n\n'),
        priority: rule.priority,
        automationRuleId: rule.id,
        triggerContext: { event: type, data: compactPayload(payload) },
      });
      await this.finishRun(verdict.runId, rule, 'TASK_CREATED', tasks[0]!.id, `Task "${title}" created.`);
      return true;
    } catch (err) {
      const msg = (err as Error).message.slice(0, 500);
      const limit = /limit|switched off|budget/i.test(msg);
      await this.finishRun(verdict.runId, rule, limit ? 'SKIPPED_LIMIT' : 'FAILED', null, msg);
      if (!limit) await this.prisma.aiAutomationRule.update({ where: { id: rule.id }, data: { lastError: msg } });
      return false;
    }
  }

  private async finishRun(runId: string, rule: Rule, status: string, taskId: string | null, message: string) {
    await this.prisma.aiAutomationRun.update({ where: { id: runId }, data: { status, taskId, message } });
    if (status === 'TASK_CREATED' || status === 'NOTIFIED') {
      await this.prisma.aiAutomationRule.update({
        where: { id: rule.id },
        data: { triggerCount: { increment: 1 }, lastTriggeredAt: new Date(), lastError: null },
      });
    }
  }

  private recordRun(rule: Rule, type: string, dedupeValue: string | null, status: string, message: string) {
    return this.prisma.aiAutomationRun.create({ data: { tenantId: rule.tenantId, ruleId: rule.id, eventType: type, dedupeValue, status, message } });
  }
}
