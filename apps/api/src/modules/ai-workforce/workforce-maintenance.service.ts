import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkforceTaskService } from './workforce-task.service';
import { WorkforceScheduleService } from './workforce-schedule.service';
import { STALE_HEARTBEAT_MS } from './task-executor.service';

/** A QUEUED task untouched for this long is assumed to have lost its queue job. */
export const LOST_JOB_AFTER_MS = 2 * 60_000;

export interface TickReport {
  schedulesRun: number;
  recovered: number;
  pausedAfterCrash: number;
  requeued: number;
  unblocked: number;
}

/**
 * Self-healing loop run by the maintenance tick (every 30s, once per cluster):
 *  1. creates runs for due schedules;
 *  2. recovers tasks whose worker died mid-run (stale heartbeat) — retried if
 *     attempts remain, otherwise paused for the owner;
 *  3. re-enqueues QUEUED tasks whose queue job was lost (e.g. Redis flushed);
 *  4. resumes tasks blocked by a daily/monthly budget once the period resets.
 */
@Injectable()
export class WorkforceMaintenanceService {
  private readonly logger = new Logger(WorkforceMaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: WorkforceTaskService,
    private readonly schedules: WorkforceScheduleService,
  ) {}

  async tick(now = new Date()): Promise<TickReport> {
    const report: TickReport = { schedulesRun: 0, recovered: 0, pausedAfterCrash: 0, requeued: 0, unblocked: 0 };
    const step = async (name: string, fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (err) {
        this.logger.error(`Maintenance step "${name}" failed: ${(err as Error).message}`);
      }
    };

    await step('schedules', async () => {
      report.schedulesRun = await this.schedules.runDue(now);
    });
    await step('stale', async () => {
      const r = await this.recoverStale(now);
      report.recovered = r.recovered;
      report.pausedAfterCrash = r.paused;
    });
    await step('lost-jobs', async () => {
      report.requeued = await this.requeueLost(now);
    });
    await step('budget-resume', async () => {
      report.unblocked = await this.resumeBudgetBlocked(now);
    });

    if (Object.values(report).some((n) => n > 0)) this.logger.log(`Maintenance: ${JSON.stringify(report)}`);
    return report;
  }

  async recoverStale(now = new Date()) {
    const cutoff = new Date(now.getTime() - STALE_HEARTBEAT_MS);
    const stale = await this.prisma.aiTask.findMany({
      where: { status: 'RUNNING', kind: { not: 'GROUP' }, OR: [{ heartbeatAt: { lt: cutoff } }, { heartbeatAt: null, updatedAt: { lt: cutoff } }] },
      select: { id: true, tenantId: true, attempts: true, maxAttempts: true, parentTaskId: true },
      take: 200,
    });
    let recovered = 0;
    let paused = 0;
    for (const t of stale) {
      const retry = t.attempts < t.maxAttempts;
      const moved = await this.prisma.aiTask.updateMany({
        where: { id: t.id, status: 'RUNNING', OR: [{ heartbeatAt: { lt: cutoff } }, { heartbeatAt: null }] },
        data: retry
          ? { status: 'QUEUED', heartbeatAt: null, error: 'The worker stopped unexpectedly; retrying.' }
          : { status: 'PAUSED', heartbeatAt: null, error: 'The worker stopped unexpectedly and no automatic retries are left. Resume the task to continue.' },
      });
      if (moved.count !== 1) continue;
      await this.tasks.addStep(t.tenantId, t.id, {
        kind: 'CONTROL',
        status: 'FAILED',
        message: retry ? 'Worker stopped mid-run — task re-queued automatically.' : 'Worker stopped mid-run — task paused (no retries left).',
      });
      if (retry) {
        await this.tasks.enqueue(t.tenantId, t.id);
        recovered++;
      } else {
        paused++;
        if (t.parentTaskId) await this.tasks.refreshGroup(t.tenantId, t.parentTaskId);
      }
    }
    return { recovered, paused };
  }

  async requeueLost(now = new Date()) {
    const cutoff = new Date(now.getTime() - LOST_JOB_AFTER_MS);
    const lost = await this.prisma.aiTask.findMany({
      where: {
        status: 'QUEUED',
        kind: { not: 'GROUP' },
        updatedAt: { lt: cutoff },
        OR: [{ nextRunAt: null }, { nextRunAt: { lt: cutoff } }],
      },
      select: { id: true, tenantId: true },
      orderBy: { updatedAt: 'asc' },
      take: 200,
    });
    for (const t of lost) {
      // Touch updatedAt so the same task isn't re-enqueued every tick while it waits its turn.
      await this.prisma.aiTask.updateMany({ where: { id: t.id, status: 'QUEUED' }, data: { nextRunAt: null } });
      await this.tasks.enqueue(t.tenantId, t.id);
    }
    return lost.length;
  }

  async resumeBudgetBlocked(now = new Date()) {
    const due = await this.prisma.aiTask.findMany({
      where: { status: 'BLOCKED', kind: { not: 'GROUP' }, nextRunAt: { lte: now } },
      select: { id: true, tenantId: true },
      take: 200,
    });
    for (const t of due) {
      const moved = await this.prisma.aiTask.updateMany({
        where: { id: t.id, status: 'BLOCKED', nextRunAt: { lte: now } },
        data: { status: 'QUEUED', nextRunAt: null, error: null },
      });
      if (moved.count !== 1) continue;
      await this.tasks.addStep(t.tenantId, t.id, { kind: 'CONTROL', message: 'Budget period reset — resuming automatically.' });
      await this.tasks.enqueue(t.tenantId, t.id);
    }
    return due.length;
  }
}
