import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

/** Effective safety limits for one tenant (tenant overrides on top of platform defaults). */
export interface AiLimits {
  aiEnabled: boolean;
  /** null = no cap. */
  monthlyBudgetUsd: number | null;
  dailyBudgetUsd: number | null;
  maxTaskCostUsd: number;
  maxTaskSteps: number;
  maxConcurrentTasks: number;
  maxTasksPerDay: number;
  maxSchedules: number;
}

export interface UsageSnapshot {
  limits: AiLimits;
  spentTodayUsd: number;
  spentThisMonthUsd: number;
  tasksCreatedToday: number;
  runningTasks: number;
  activeSchedules: number;
}

export type BudgetCheck = { ok: true } | { ok: false; reason: string };

const num = (v: string | undefined, def: number) => {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) && n >= 0 ? n : def;
};
const optNum = (v: string | undefined, def: number | null) => {
  if (v === undefined || v === '') return def;
  if (v.toLowerCase() === 'none' || v.toLowerCase() === 'unlimited') return null;
  return num(v, def ?? 0);
};

/**
 * Platform defaults, overridable per deployment via env. They are deliberately
 * conservative: an AI workforce left running 24/7 must never be able to spend
 * without bound, so every tenant starts with a budget.
 */
export function platformDefaultLimits(env: NodeJS.ProcessEnv = process.env): AiLimits {
  return {
    aiEnabled: true,
    monthlyBudgetUsd: optNum(env.AI_DEFAULT_MONTHLY_BUDGET_USD, 50),
    dailyBudgetUsd: optNum(env.AI_DEFAULT_DAILY_BUDGET_USD, 5),
    maxTaskCostUsd: num(env.AI_DEFAULT_MAX_TASK_COST_USD, 0.5),
    maxTaskSteps: Math.max(1, Math.round(num(env.AI_DEFAULT_MAX_TASK_STEPS, 8))),
    maxConcurrentTasks: Math.max(1, Math.round(num(env.AI_DEFAULT_MAX_CONCURRENT_TASKS, 3))),
    maxTasksPerDay: Math.max(1, Math.round(num(env.AI_DEFAULT_MAX_TASKS_PER_DAY, 300))),
    maxSchedules: Math.max(0, Math.round(num(env.AI_DEFAULT_MAX_SCHEDULES, 25))),
  };
}

/** Hard ceilings a tenant override can never exceed (protects the platform). */
const CEILINGS = { maxTaskSteps: 30, maxConcurrentTasks: 20, maxTasksPerDay: 5000, maxSchedules: 500, maxTaskCostUsd: 25 };

type SettingsRow = Prisma.TenantAiSettingsGetPayload<object>;

export function mergeLimits(defaults: AiLimits, row: SettingsRow | null): AiLimits {
  if (!row) return defaults;
  const dec = (d: Prisma.Decimal | null | undefined) => (d === null || d === undefined ? undefined : Number(d));
  return {
    aiEnabled: row.aiEnabled,
    monthlyBudgetUsd: dec(row.monthlyBudgetUsd) ?? defaults.monthlyBudgetUsd,
    dailyBudgetUsd: dec(row.dailyBudgetUsd) ?? defaults.dailyBudgetUsd,
    maxTaskCostUsd: Math.min(CEILINGS.maxTaskCostUsd, dec(row.maxTaskCostUsd) ?? defaults.maxTaskCostUsd),
    maxTaskSteps: Math.min(CEILINGS.maxTaskSteps, row.maxTaskSteps ?? defaults.maxTaskSteps),
    maxConcurrentTasks: Math.min(CEILINGS.maxConcurrentTasks, row.maxConcurrentTasks ?? defaults.maxConcurrentTasks),
    maxTasksPerDay: Math.min(CEILINGS.maxTasksPerDay, row.maxTasksPerDay ?? defaults.maxTasksPerDay),
    maxSchedules: Math.min(CEILINGS.maxSchedules, row.maxSchedules ?? defaults.maxSchedules),
  };
}

export const startOfUtcDay = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
export const startOfUtcMonth = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

/**
 * Cost and loop safeguards for the AI workforce: tenant kill switch, daily and
 * monthly spend caps (measured from AiUsageLog, i.e. what providers actually
 * reported), a per-task cost cap, and caps on tasks/day, concurrency and
 * schedules.
 */
@Injectable()
export class UsageLimitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async limits(tenantId: string): Promise<AiLimits> {
    const row = await this.prisma.tenantAiSettings.findUnique({ where: { tenantId } });
    return mergeLimits(platformDefaultLimits(), row);
  }

  async spentSince(tenantId: string, since: Date): Promise<number> {
    const agg = await this.prisma.aiUsageLog.aggregate({
      where: { tenantId, createdAt: { gte: since } },
      _sum: { estimatedCostUsd: true },
    });
    return Number(agg._sum.estimatedCostUsd ?? 0);
  }

  /** Can this tenant start (or continue) AI work right now? */
  async checkBudget(tenantId: string, limits?: AiLimits): Promise<BudgetCheck> {
    const l = limits ?? (await this.limits(tenantId));
    if (!l.aiEnabled) return { ok: false, reason: 'AI workforce is switched off for this business (Settings → AI limits).' };
    const [day, month] = await Promise.all([
      l.dailyBudgetUsd !== null ? this.spentSince(tenantId, startOfUtcDay()) : Promise.resolve(0),
      l.monthlyBudgetUsd !== null ? this.spentSince(tenantId, startOfUtcMonth()) : Promise.resolve(0),
    ]);
    if (l.dailyBudgetUsd !== null && day >= l.dailyBudgetUsd) {
      return { ok: false, reason: `Daily AI budget reached ($${day.toFixed(2)} of $${l.dailyBudgetUsd.toFixed(2)}). Work resumes tomorrow or when the owner raises the limit.` };
    }
    if (l.monthlyBudgetUsd !== null && month >= l.monthlyBudgetUsd) {
      return { ok: false, reason: `Monthly AI budget reached ($${month.toFixed(2)} of $${l.monthlyBudgetUsd.toFixed(2)}). Raise the limit to continue.` };
    }
    return { ok: true };
  }

  /** Throws if creating `count` more tasks today would exceed the tenant's cap. */
  async assertCanCreateTasks(tenantId: string, count = 1): Promise<void> {
    const l = await this.limits(tenantId);
    if (!l.aiEnabled) throw new BadRequestException('AI workforce is switched off for this business.');
    const today = await this.prisma.aiTask.count({ where: { tenantId, kind: { not: 'GROUP' }, createdAt: { gte: startOfUtcDay() } } });
    if (today + count > l.maxTasksPerDay) {
      throw new BadRequestException(`Daily task limit reached (${l.maxTasksPerDay} tasks per day). Try again tomorrow or raise the limit.`);
    }
  }

  async assertCanCreateSchedule(tenantId: string): Promise<void> {
    const l = await this.limits(tenantId);
    const active = await this.prisma.aiTaskSchedule.count({ where: { tenantId, enabled: true } });
    if (active >= l.maxSchedules) throw new BadRequestException(`Schedule limit reached (${l.maxSchedules} active schedules).`);
  }

  async snapshot(tenantId: string): Promise<UsageSnapshot> {
    const limits = await this.limits(tenantId);
    const [spentTodayUsd, spentThisMonthUsd, tasksCreatedToday, runningTasks, activeSchedules] = await Promise.all([
      this.spentSince(tenantId, startOfUtcDay()),
      this.spentSince(tenantId, startOfUtcMonth()),
      this.prisma.aiTask.count({ where: { tenantId, kind: { not: 'GROUP' }, createdAt: { gte: startOfUtcDay() } } }),
      this.prisma.aiTask.count({ where: { tenantId, kind: { not: 'GROUP' }, status: 'RUNNING' } }),
      this.prisma.aiTaskSchedule.count({ where: { tenantId, enabled: true } }),
    ]);
    return { limits, spentTodayUsd, spentThisMonthUsd, tasksCreatedToday, runningTasks, activeSchedules };
  }

  async updateSettings(tenantId: string, userId: string, patch: Partial<Record<keyof AiLimits, unknown>>) {
    const data: Prisma.TenantAiSettingsUncheckedCreateInput = { tenantId, updatedByUserId: userId };
    const money = (k: 'monthlyBudgetUsd' | 'dailyBudgetUsd' | 'maxTaskCostUsd', max: number) => {
      if (!(k in patch)) return;
      const v = patch[k];
      if (v === null) {
        if (k === 'maxTaskCostUsd') throw new BadRequestException('maxTaskCostUsd cannot be unlimited.');
        data[k] = null;
        return;
      }
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > max) throw new BadRequestException(`${k} must be between 0 and ${max}.`);
      data[k] = new Prisma.Decimal(n.toFixed(4));
    };
    const int = (k: 'maxTaskSteps' | 'maxConcurrentTasks' | 'maxTasksPerDay' | 'maxSchedules', min: number, max: number) => {
      if (!(k in patch)) return;
      const v = patch[k];
      if (v === null) {
        data[k] = null;
        return;
      }
      const n = Number(v);
      if (!Number.isInteger(n) || n < min || n > max) throw new BadRequestException(`${k} must be a whole number between ${min} and ${max}.`);
      data[k] = n;
    };
    money('monthlyBudgetUsd', 100000);
    money('dailyBudgetUsd', 10000);
    money('maxTaskCostUsd', CEILINGS.maxTaskCostUsd);
    int('maxTaskSteps', 1, CEILINGS.maxTaskSteps);
    int('maxConcurrentTasks', 1, CEILINGS.maxConcurrentTasks);
    int('maxTasksPerDay', 1, CEILINGS.maxTasksPerDay);
    int('maxSchedules', 0, CEILINGS.maxSchedules);
    if ('aiEnabled' in patch) {
      if (typeof patch.aiEnabled !== 'boolean') throw new BadRequestException('aiEnabled must be true or false.');
      data.aiEnabled = patch.aiEnabled;
    }
    const { tenantId: _t, ...update } = data;
    await this.prisma.tenantAiSettings.upsert({ where: { tenantId }, create: data, update });
    await this.audit.record(tenantId, userId, 'ai_settings.updated', 'TenantAiSettings', tenantId, { changes: patch });
    return this.snapshot(tenantId);
  }
}
