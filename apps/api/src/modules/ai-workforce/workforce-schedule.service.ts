import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { ACTIVE_STATUSES, WorkforceTaskService } from './workforce-task.service';
import { UsageLimitsService } from './usage-limits.service';
import { assertScheduleAllowed, isValidTimezone, nextRun } from './cron';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const OVERLAP = ['SKIP', 'QUEUE'];

export interface ScheduleInput {
  employeeId?: string;
  title?: string;
  description?: string;
  goal?: string | null;
  priority?: string;
  cron?: string;
  timezone?: string;
  enabled?: boolean;
  overlapPolicy?: string;
  maxConsecutiveFailures?: number;
}

/**
 * Recurring AI work ("every weekday at 9:00 check yesterday's no-shows").
 * The maintenance tick calls `runDue()`; each due schedule is claimed
 * atomically by advancing `nextRunAt`, so several instances never create the
 * same run twice. Overlapping runs are skipped by default, and a schedule
 * that keeps failing disables itself and tells the owner.
 */
@Injectable()
export class WorkforceScheduleService {
  private readonly logger = new Logger(WorkforceScheduleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly tasks: WorkforceTaskService,
    private readonly limits: UsageLimitsService,
  ) {}

  list(tenantId: string, employeeId?: string) {
    return this.prisma.aiTaskSchedule.findMany({
      where: { tenantId, ...(employeeId ? { employeeId } : {}) },
      include: { employee: { select: { id: true, name: true, role: true, status: true } } },
      orderBy: [{ enabled: 'desc' }, { nextRunAt: 'asc' }],
    });
  }

  async get(tenantId: string, id: string) {
    const s = await this.prisma.aiTaskSchedule.findFirst({
      where: { id, tenantId },
      include: {
        employee: { select: { id: true, name: true, role: true, status: true } },
        tasks: { select: { id: true, status: true, createdAt: true, completedAt: true, costUsd: true }, orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!s) throw new NotFoundException('Schedule not found');
    return s;
  }

  async create(tenantId: string, userId: string, input: ScheduleInput) {
    await this.limits.assertCanCreateSchedule(tenantId);
    const data = await this.validate(tenantId, input, true);
    const created = await this.prisma.aiTaskSchedule.create({
      data: { ...(data as Prisma.AiTaskScheduleUncheckedCreateInput), tenantId, createdByUserId: userId },
    });
    await this.audit.record(tenantId, userId, 'ai_schedule.created', 'AiTaskSchedule', created.id, {
      employeeId: created.employeeId,
      cron: created.cron,
      timezone: created.timezone,
      title: created.title,
    });
    return created;
  }

  async update(tenantId: string, userId: string, id: string, input: ScheduleInput) {
    const existing = await this.prisma.aiTaskSchedule.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Schedule not found');
    if (input.enabled === true && !existing.enabled) await this.limits.assertCanCreateSchedule(tenantId);
    const data = await this.validate(tenantId, { ...existing, goal: existing.goal, ...input }, false);
    // Re-enabling resets the failure streak.
    if (input.enabled === true && !existing.enabled) (data as Prisma.AiTaskScheduleUpdateInput).consecutiveFailures = 0;
    const updated = await this.prisma.aiTaskSchedule.update({ where: { id }, data });
    await this.audit.record(tenantId, userId, 'ai_schedule.updated', 'AiTaskSchedule', id, { changes: input });
    return updated;
  }

  async remove(tenantId: string, userId: string, id: string) {
    const existing = await this.prisma.aiTaskSchedule.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Schedule not found');
    await this.prisma.aiTaskSchedule.delete({ where: { id } });
    await this.audit.record(tenantId, userId, 'ai_schedule.deleted', 'AiTaskSchedule', id, { title: existing.title });
    return { deleted: true };
  }

  /** Runs a schedule once, now, without changing its timetable. */
  async runNow(tenantId: string, userId: string, id: string) {
    const s = await this.prisma.aiTaskSchedule.findFirst({ where: { id, tenantId } });
    if (!s) throw new NotFoundException('Schedule not found');
    const res = await this.createRun(s, userId);
    if (!res.task) throw new BadRequestException(res.skipped ?? 'Could not start the schedule.');
    return res.task;
  }

  /** Called by the maintenance tick. Returns how many runs were created. */
  async runDue(now = new Date(), batch = 100): Promise<number> {
    const due = await this.prisma.aiTaskSchedule.findMany({
      where: { enabled: true, nextRunAt: { lte: now } },
      orderBy: { nextRunAt: 'asc' },
      take: batch,
    });
    let created = 0;
    for (const s of due) {
      let next: Date | null;
      try {
        next = nextRun(s.cron, s.timezone, now);
      } catch (err) {
        next = null;
        this.logger.warn(`Schedule ${s.id} has an invalid cron and was disabled: ${(err as Error).message}`);
      }
      // Claim: only the instance that moves nextRunAt forward creates the run.
      const claimed = await this.prisma.aiTaskSchedule.updateMany({
        where: { id: s.id, enabled: true, nextRunAt: s.nextRunAt },
        data: next ? { nextRunAt: next, lastRunAt: now } : { enabled: false, lastStatus: 'INVALID_CRON' },
      });
      if (claimed.count !== 1 || !next) continue;
      try {
        const res = await this.createRun(s, s.createdByUserId ?? '');
        if (res.task) created++;
      } catch (err) {
        this.logger.error(`Schedule ${s.id} run failed to start: ${(err as Error).message}`);
        await this.prisma.aiTaskSchedule.update({ where: { id: s.id }, data: { lastStatus: 'START_FAILED' } });
      }
    }
    return created;
  }

  private async createRun(
    s: Prisma.AiTaskScheduleGetPayload<object>,
    userId: string,
  ): Promise<{ task?: { id: string }; skipped?: string }> {
    const skip = async (status: string, reason: string) => {
      await this.prisma.aiTaskSchedule.update({ where: { id: s.id }, data: { lastStatus: status } });
      return { skipped: reason };
    };

    if (s.overlapPolicy === 'SKIP') {
      const active = await this.prisma.aiTask.findFirst({
        where: { tenantId: s.tenantId, scheduleId: s.id, status: { in: ACTIVE_STATUSES } },
        select: { id: true },
      });
      if (active) return skip('SKIPPED_OVERLAP', 'The previous run is still in progress.');
    }
    const budget = await this.limits.checkBudget(s.tenantId);
    if (!budget.ok) return skip('SKIPPED_LIMIT', budget.reason);

    let result;
    try {
      result = await this.tasks.createTasks(s.tenantId, userId, {
        employeeIds: [s.employeeId],
        title: s.title,
        description: s.description,
        goal: s.goal,
        priority: s.priority,
        scheduleId: s.id,
      });
    } catch (err) {
      return skip('SKIPPED_LIMIT', (err as Error).message);
    }
    const task = result.tasks[0]!;
    await this.prisma.aiTaskSchedule.update({ where: { id: s.id }, data: { lastTaskId: task.id, lastStatus: task.status } });
    return { task };
  }

  /** Executor callback when a scheduled run reaches a final state. */
  async recordOutcome(tenantId: string, scheduleId: string, status: string) {
    const s = await this.prisma.aiTaskSchedule.findFirst({ where: { id: scheduleId, tenantId } });
    if (!s) return;
    if (status !== 'FAILED') {
      await this.prisma.aiTaskSchedule.update({ where: { id: s.id }, data: { lastStatus: status, consecutiveFailures: 0 } });
      return;
    }
    const failures = s.consecutiveFailures + 1;
    const disable = failures >= s.maxConsecutiveFailures;
    await this.prisma.aiTaskSchedule.update({
      where: { id: s.id },
      data: { lastStatus: status, consecutiveFailures: failures, ...(disable ? { enabled: false } : {}) },
    });
    if (disable) {
      await this.audit.record(tenantId, undefined, 'ai_schedule.auto_disabled', 'AiTaskSchedule', s.id, { failures });
      await this.tasks.notifyOwners(tenantId, {
        type: 'ai_workforce.schedule_disabled',
        title: `Schedule paused: ${s.title}`,
        body: `It failed ${failures} times in a row, so it was switched off. Check the last run's error, then re-enable it.`,
        metadata: { scheduleId: s.id },
      });
    }
  }

  private async validate(tenantId: string, input: ScheduleInput, creating: boolean) {
    const data: Record<string, unknown> = {};
    if (creating || input.employeeId !== undefined) {
      if (!input.employeeId) throw new BadRequestException('employeeId is required.');
      const emp = await this.prisma.aiEmployee.findFirst({ where: { id: input.employeeId, tenantId }, select: { id: true } });
      if (!emp) throw new NotFoundException('AI employee not found');
      data.employeeId = emp.id;
    }
    const title = input.title?.trim();
    if (creating && !title) throw new BadRequestException('A title is required.');
    if (title) data.title = title.slice(0, 200);
    if (input.description !== undefined) data.description = String(input.description ?? '').slice(0, 8000);
    if (input.goal !== undefined) data.goal = input.goal ? String(input.goal).slice(0, 2000) : null;
    if (input.priority !== undefined) {
      const p = String(input.priority).toUpperCase();
      if (!PRIORITIES.includes(p)) throw new BadRequestException(`priority must be one of ${PRIORITIES.join(', ')}`);
      data.priority = p;
    }
    if (input.overlapPolicy !== undefined) {
      const o = String(input.overlapPolicy).toUpperCase();
      if (!OVERLAP.includes(o)) throw new BadRequestException(`overlapPolicy must be one of ${OVERLAP.join(', ')}`);
      data.overlapPolicy = o;
    }
    if (input.maxConsecutiveFailures !== undefined) {
      const n = Number(input.maxConsecutiveFailures);
      if (!Number.isInteger(n) || n < 1 || n > 20) throw new BadRequestException('maxConsecutiveFailures must be 1–20.');
      data.maxConsecutiveFailures = n;
    }
    if (input.enabled !== undefined) data.enabled = Boolean(input.enabled);

    const tz = (input.timezone ?? (await this.businessTimezone(tenantId))).trim();
    if (!isValidTimezone(tz)) throw new BadRequestException(`Unknown timezone "${tz}".`);
    if (creating && !input.cron) throw new BadRequestException('cron is required (e.g. "0 9 * * 1-5").');
    if (input.cron !== undefined || input.timezone !== undefined || input.enabled === true || creating) {
      try {
        data.nextRunAt = assertScheduleAllowed(String(input.cron), tz);
      } catch (err) {
        throw new BadRequestException((err as Error).message);
      }
      data.cron = String(input.cron).trim().replace(/\s+/g, ' ');
      data.timezone = tz;
    }
    return data;
  }

  private async businessTimezone(tenantId: string) {
    const b = await this.prisma.business.findFirst({ where: { tenantId }, select: { timezone: true }, orderBy: { createdAt: 'asc' } });
    return b?.timezone || 'UTC';
  }
}
