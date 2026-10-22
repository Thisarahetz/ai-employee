import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

export const TASK_QUEUE = 'ai-workforce-tasks';
export const MAINTENANCE_QUEUE = 'ai-workforce-maintenance';
export const MAINTENANCE_TICK_JOB = 'tick';
/** How often the maintenance tick runs (schedules, crash recovery, lost-job reconcile). */
export const TICK_EVERY_MS = 30_000;

const PRIORITY: Record<string, number> = { URGENT: 1, HIGH: 2, MEDIUM: 3, LOW: 4 };

export interface TaskJobData {
  taskId: string;
  tenantId: string;
}

/**
 * Producer side of the durable task queue (BullMQ on Redis). The database is
 * the source of truth — a job only says "look at this task"; the worker claims
 * it atomically, so a duplicate or stale job is harmless, and the maintenance
 * tick re-enqueues any QUEUED task whose job was lost.
 */
@Injectable()
export class TaskQueueService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TaskQueueService.name);

  constructor(
    @InjectQueue(TASK_QUEUE) private readonly queue: Queue<TaskJobData>,
    @InjectQueue(MAINTENANCE_QUEUE) private readonly maintenance: Queue,
  ) {}

  async onApplicationBootstrap() {
    if (process.env.AI_WORKFORCE_SCHEDULER === 'false') return;
    try {
      // One scheduler entry per Redis, however many API/worker instances run.
      await this.maintenance.upsertJobScheduler(MAINTENANCE_TICK_JOB, { every: TICK_EVERY_MS }, { name: MAINTENANCE_TICK_JOB });
    } catch (err) {
      this.logger.error(`Could not register the maintenance scheduler: ${(err as Error).message}`);
    }
  }

  async enqueue(tenantId: string, taskId: string, opts: { priority?: string; delayMs?: number; attempt?: number } = {}) {
    try {
      await this.queue.add(
        'run',
        { taskId, tenantId },
        {
          // Same task + attempt → same job id, so double enqueues collapse while a
          // job is waiting. Finished jobs are removed at once so their id never
          // blocks a later resume/retry from being queued.
          // Delayed jobs (retries, concurrency deferrals) get a unique id: they are
          // often added from inside the still-active job for the same task.
          jobId: `task-${taskId}-a${opts.attempt ?? 0}${opts.delayMs ? `-d${Date.now()}` : ''}`,
          priority: PRIORITY[opts.priority ?? 'MEDIUM'] ?? 3,
          delay: opts.delayMs && opts.delayMs > 0 ? Math.round(opts.delayMs) : undefined,
          removeOnComplete: true,
          removeOnFail: true,
          attempts: 1, // retries are decided by the task state machine, not BullMQ
        },
      );
    } catch (err) {
      // The task row is still QUEUED; the maintenance tick will pick it up.
      this.logger.error(`Failed to enqueue task ${taskId}: ${(err as Error).message}`);
    }
  }

  /** For health checks / the monitoring endpoint. */
  async counts() {
    return this.queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'prioritized');
  }
}
