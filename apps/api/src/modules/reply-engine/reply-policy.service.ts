import { BadRequestException, Injectable } from '@nestjs/common';
import { ReplyMode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UsageLimitsService } from '../ai-workforce/usage-limits.service';

export const ALL_REPLY_MODES: ReplyMode[] = [ReplyMode.AI, ReplyMode.HYBRID, ReplyMode.NO_AI];

/** When the chosen mode isn't allowed by the plan, the first allowed one of these is used. */
const FALLBACK_ORDER: ReplyMode[] = [ReplyMode.HYBRID, ReplyMode.NO_AI, ReplyMode.AI];

export function isReplyMode(v: unknown): v is ReplyMode {
  return typeof v === 'string' && (ALL_REPLY_MODES as string[]).includes(v);
}

/** The mode a business actually runs in: its own choice if the plan allows it. */
export function effectiveReplyMode(chosen: ReplyMode, allowed: ReplyMode[]): ReplyMode {
  const list = allowed.length ? allowed : ALL_REPLY_MODES;
  if (list.includes(chosen)) return chosen;
  return FALLBACK_ORDER.find((m) => list.includes(m)) ?? ReplyMode.NO_AI;
}

/** Tenant.plan values map to plan ids; trial businesses follow the Free plan's rules. */
export function planIdOf(plan: string): string {
  const id = plan.trim().toLowerCase();
  return id === 'trial' ? 'free' : id;
}

export interface ReplySettings {
  plan: string;
  /** What the business picked in Settings. */
  mode: ReplyMode;
  /** What is actually used (the plan may not allow `mode`). */
  effectiveMode: ReplyMode;
  allowedModes: ReplyMode[];
}

@Injectable()
export class ReplyPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usageLimits: UsageLimitsService,
  ) {}

  async allowedModesForPlan(planId: string): Promise<ReplyMode[]> {
    const row = await this.prisma.planSettings.findUnique({ where: { planId: planIdOf(planId) } });
    return row?.allowedReplyModes.length ? row.allowedReplyModes : ALL_REPLY_MODES;
  }

  async getSettings(tenantId: string): Promise<ReplySettings> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { plan: true, replyMode: true },
    });
    const allowedModes = await this.allowedModesForPlan(tenant.plan);
    return {
      plan: tenant.plan,
      mode: tenant.replyMode,
      effectiveMode: effectiveReplyMode(tenant.replyMode, allowedModes),
      allowedModes,
    };
  }

  async setMode(tenantId: string, mode: unknown): Promise<ReplySettings> {
    if (!isReplyMode(mode)) throw new BadRequestException('mode must be one of AI, HYBRID or NO_AI.');
    const current = await this.getSettings(tenantId);
    if (!current.allowedModes.includes(mode)) {
      throw new BadRequestException('Your plan does not include this reply mode. Upgrade your plan to use it.');
    }
    await this.prisma.tenant.update({ where: { id: tenantId }, data: { replyMode: mode } });
    return this.getSettings(tenantId);
  }

  /**
   * May customer replies spend AI money right now? Follows the business's AI
   * budgets. (The "AI workforce" on/off switch is for background tasks; for
   * customer replies the owner uses the No-AI reply mode instead.)
   */
  async aiBudgetAvailable(tenantId: string): Promise<boolean> {
    const limits = await this.usageLimits.limits(tenantId);
    const check = await this.usageLimits.checkBudget(tenantId, { ...limits, aiEnabled: true });
    return check.ok;
  }

  // ── Platform admin: per-plan rules ──────────────────────────────────────

  async listPlanSettings(): Promise<Record<string, ReplyMode[]>> {
    const rows = await this.prisma.planSettings.findMany();
    return Object.fromEntries(rows.map((r) => [r.planId, r.allowedReplyModes.length ? r.allowedReplyModes : ALL_REPLY_MODES]));
  }

  async setPlanReplyModes(planId: string, modes: unknown): Promise<ReplyMode[]> {
    if (!Array.isArray(modes) || !modes.length || !modes.every(isReplyMode)) {
      throw new BadRequestException('allowedReplyModes must list at least one of AI, HYBRID, NO_AI.');
    }
    const unique = ALL_REPLY_MODES.filter((m) => modes.includes(m));
    const id = planIdOf(planId);
    await this.prisma.planSettings.upsert({
      where: { planId: id },
      create: { planId: id, allowedReplyModes: unique },
      update: { allowedReplyModes: unique },
    });
    return unique;
  }
}
