import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TaskQueueService } from '../ai-workforce/task-queue.service';
import { AiLimits, UsageLimitsService, startOfUtcDay, startOfUtcMonth } from '../ai-workforce/usage-limits.service';
import { STALE_HEARTBEAT_MS } from '../ai-workforce/task-executor.service';
import type { AdminActor } from './admin.service';

const num = (v: unknown) => Number(v ?? 0);

/**
 * Cross-tenant AI cost and platform health for platform super admins. Every
 * figure is aggregated from recorded rows (AiUsageLog, AiTask, schedules,
 * rules) — nothing estimated. Only reachable behind PlatformAdminGuard.
 */
@Injectable()
export class AdminMonitoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: TaskQueueService,
    private readonly limits: UsageLimitsService,
  ) {}

  async aiUsage(daysRaw?: number) {
    const days = Math.min(90, Math.max(1, Math.round(daysRaw || 30)));
    const since = new Date(startOfUtcDay().getTime() - (days - 1) * 86400e3);
    const today = startOfUtcDay();
    const month = startOfUtcMonth();

    const [period, todayAgg, monthAgg, daily, byModel, byTenantPeriod, byTenantToday, byTenantMonth, taskStats, ownKeys] = await Promise.all([
      this.prisma.aiUsageLog.aggregate({ where: { createdAt: { gte: since } }, _sum: { estimatedCostUsd: true, inputTokens: true, outputTokens: true }, _count: { _all: true } }),
      this.prisma.aiUsageLog.aggregate({ where: { createdAt: { gte: today } }, _sum: { estimatedCostUsd: true } }),
      this.prisma.aiUsageLog.aggregate({ where: { createdAt: { gte: month } }, _sum: { estimatedCostUsd: true } }),
      this.prisma.$queryRaw<{ day: Date; cost: Prisma.Decimal; calls: bigint }[]>`
        SELECT date_trunc('day', "createdAt") AS day, SUM("estimatedCostUsd") AS cost, COUNT(*) AS calls
        FROM ai_usage_logs WHERE "createdAt" >= ${since}
        GROUP BY 1 ORDER BY 1`,
      this.prisma.aiUsageLog.groupBy({ by: ['provider', 'model'], where: { createdAt: { gte: since } }, _sum: { estimatedCostUsd: true }, _count: { _all: true } }),
      this.prisma.aiUsageLog.groupBy({ by: ['tenantId'], where: { createdAt: { gte: since } }, _sum: { estimatedCostUsd: true }, _count: { _all: true } }),
      this.prisma.aiUsageLog.groupBy({ by: ['tenantId'], where: { createdAt: { gte: today } }, _sum: { estimatedCostUsd: true } }),
      this.prisma.aiUsageLog.groupBy({ by: ['tenantId'], where: { createdAt: { gte: month } }, _sum: { estimatedCostUsd: true } }),
      this.prisma.aiTask.groupBy({ by: ['tenantId', 'status'], where: { kind: { not: 'GROUP' }, updatedAt: { gte: since } }, _count: { _all: true } }),
      this.prisma.tenantAiProviderKey.groupBy({ by: ['tenantId'], _count: { _all: true } }),
    ]);

    const tenantIds = byTenantPeriod.map((t) => t.tenantId);
    const [tenants, settings] = await Promise.all([
      this.prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true, slug: true, status: true, plan: true } }),
      this.prisma.tenantAiSettings.findMany({ where: { tenantId: { in: tenantIds } } }),
    ]);
    const { mergeLimits, platformDefaultLimits } = await import('../ai-workforce/usage-limits.service');

    const byTenant = byTenantPeriod
      .map((row) => {
        const t = tenants.find((x) => x.id === row.tenantId);
        const l: AiLimits = mergeLimits(platformDefaultLimits(), settings.find((s) => s.tenantId === row.tenantId) ?? null);
        const count = (st: string) => taskStats.find((s) => s.tenantId === row.tenantId && s.status === st)?._count._all ?? 0;
        const costMonth = num(byTenantMonth.find((x) => x.tenantId === row.tenantId)?._sum.estimatedCostUsd);
        return {
          tenantId: row.tenantId,
          name: t?.name ?? '(deleted)',
          slug: t?.slug ?? null,
          status: t?.status ?? null,
          plan: t?.plan ?? null,
          costUsd: num(row._sum.estimatedCostUsd),
          costTodayUsd: num(byTenantToday.find((x) => x.tenantId === row.tenantId)?._sum.estimatedCostUsd),
          costMonthUsd: costMonth,
          calls: row._count._all,
          tasksCompleted: count('COMPLETED'),
          tasksFailed: count('FAILED'),
          tasksBlocked: count('BLOCKED'),
          aiEnabled: l.aiEnabled,
          monthlyBudgetUsd: l.monthlyBudgetUsd,
          monthlyBudgetUsedPct: l.monthlyBudgetUsd ? Math.round((costMonth / l.monthlyBudgetUsd) * 100) : null,
          usesOwnKeys: ownKeys.some((k) => k.tenantId === row.tenantId),
        };
      })
      .sort((a, b) => b.costUsd - a.costUsd)
      .slice(0, 100);

    return {
      days,
      since,
      totals: {
        costUsd: num(period._sum.estimatedCostUsd),
        costTodayUsd: num(todayAgg._sum.estimatedCostUsd),
        costMonthUsd: num(monthAgg._sum.estimatedCostUsd),
        calls: period._count._all,
        inputTokens: num(period._sum.inputTokens),
        outputTokens: num(period._sum.outputTokens),
        activeTenants: byTenantPeriod.length,
        tenantsWithOwnKeys: ownKeys.length,
      },
      daily: daily.map((d) => ({ date: d.day.toISOString().slice(0, 10), costUsd: num(d.cost), calls: Number(d.calls) })),
      byModel: byModel
        .map((m) => ({ provider: m.provider, model: m.model, costUsd: num(m._sum.estimatedCostUsd), calls: m._count._all }))
        .sort((a, b) => b.costUsd - a.costUsd),
      byTenant,
    };
  }

  async systemHealth() {
    const now = Date.now();
    const staleCutoff = new Date(now - STALE_HEARTBEAT_MS);
    const dayAgo = new Date(now - 86400e3);
    const [dbOk, queue, running, stale, overdue, failed24h, blocked, disabledSchedules, failingRules, recentFailures] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      this.queue.counts().catch(() => null),
      this.prisma.aiTask.count({ where: { status: 'RUNNING', kind: { not: 'GROUP' } } }),
      this.prisma.aiTask.count({ where: { status: 'RUNNING', kind: { not: 'GROUP' }, heartbeatAt: { lt: staleCutoff } } }),
      this.prisma.aiTask.count({ where: { status: 'QUEUED', kind: { not: 'GROUP' }, updatedAt: { lt: new Date(now - 10 * 60_000) }, OR: [{ nextRunAt: null }, { nextRunAt: { lt: new Date(now - 10 * 60_000) } }] } }),
      this.prisma.aiTask.count({ where: { status: 'FAILED', kind: { not: 'GROUP' }, updatedAt: { gte: dayAgo } } }),
      this.prisma.aiTask.count({ where: { status: 'BLOCKED', kind: { not: 'GROUP' } } }),
      this.prisma.aiTaskSchedule.count({ where: { enabled: false, lastStatus: 'FAILED', updatedAt: { gte: new Date(now - 7 * 86400e3) } } }),
      this.prisma.aiAutomationRule.count({ where: { enabled: true, lastError: { not: null } } }),
      this.prisma.aiTask.findMany({
        where: { status: 'FAILED', kind: { not: 'GROUP' }, updatedAt: { gte: dayAgo } },
        select: { id: true, title: true, error: true, updatedAt: true, attempts: true, tenant: { select: { name: true, slug: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      }),
    ]);
    const issues: string[] = [];
    if (!dbOk) issues.push('Database is unreachable.');
    if (!queue) issues.push('Task queue (Redis) is unreachable — background work is not running.');
    if (stale) issues.push(`${stale} running task(s) have a stale heartbeat (worker may be down).`);
    if (overdue) issues.push(`${overdue} queued task(s) have waited over 10 minutes.`);
    return {
      status: issues.length ? 'degraded' : 'healthy',
      issues,
      database: dbOk ? 'up' : 'down',
      queue,
      tasks: { running, staleRunning: stale, overdueQueued: overdue, failedLast24h: failed24h, blockedByLimits: blocked },
      schedulesAutoDisabledLast7d: disabledSchedules,
      automationRulesWithErrors: failingRules,
      recentFailures: recentFailures.map((f) => ({ ...f, error: f.error?.slice(0, 300) ?? null })),
    };
  }

  async tenantLimits(tenantId: string) {
    await this.assertTenant(tenantId);
    return this.limits.snapshot(tenantId);
  }

  /** Platform override of a tenant's AI limits (e.g. a runaway bill or a plan change). Audited. */
  async setTenantLimits(tenantId: string, patch: Partial<Record<keyof AiLimits, unknown>>, actor: AdminActor) {
    await this.assertTenant(tenantId);
    const owner = await this.prisma.tenantMembership.findFirst({ where: { tenantId, role: 'OWNER' }, select: { userId: true } });
    const result = await this.limits.updateSettings(tenantId, owner?.userId ?? actor.userId, patch);
    await this.prisma.platformAuditLog.create({
      data: { actorUserId: actor.userId, action: 'tenant.ai_limits_updated', targetType: 'tenant', targetId: tenantId, changes: patch as Prisma.InputJsonValue, ipAddress: actor.ipAddress },
    });
    return result;
  }

  private async assertTenant(tenantId: string) {
    const t = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!t) throw new NotFoundException('Tenant not found');
  }
}
