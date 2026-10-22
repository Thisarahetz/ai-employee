import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { MAINTENANCE_QUEUE, TASK_QUEUE, TaskJobData } from './task-queue.service';
import { TaskExecutorService } from './task-executor.service';
import { WorkforceTaskService } from './workforce-task.service';
import { WorkforceMaintenanceService } from './workforce-maintenance.service';

/** Jobs that find the tenant at its concurrency limit come back after this delay. */
const DEFER_MS = 15_000;

const concurrency = () => {
  const n = Number(process.env.AI_WORKFORCE_WORKER_CONCURRENCY);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 50) : 5;
};

/**
 * Consumes the task queue. Run as many worker processes as needed: the
 * database claim keeps execution exactly-once per attempt, and per-tenant
 * concurrency is enforced in the claim, not here.
 */
@Processor(TASK_QUEUE, { concurrency: concurrency(), lockDuration: 120_000 })
export class TaskWorkerProcessor extends WorkerHost {
  private readonly logger = new Logger(TaskWorkerProcessor.name);

  constructor(
    private readonly executor: TaskExecutorService,
    private readonly tasks: WorkforceTaskService,
  ) {
    super();
  }

  async process(job: Job<TaskJobData>): Promise<string> {
    const { taskId, tenantId } = job.data;
    try {
      const outcome = await this.executor.run(taskId);
      if (outcome === 'DEFERRED') await this.tasks.enqueue(tenantId, taskId, DEFER_MS);
      return outcome;
    } catch (err) {
      // run() handles its own failures; anything here is infrastructure (DB down).
      // The task stays QUEUED/RUNNING and the maintenance tick recovers it.
      this.logger.error(`Task job ${job.id} crashed: ${(err as Error).message}`);
      return 'CRASHED';
    }
  }
}

@Processor(MAINTENANCE_QUEUE, { concurrency: 1 })
export class MaintenanceProcessor extends WorkerHost {
  constructor(private readonly maintenance: WorkforceMaintenanceService) {
    super();
  }

  async process(): Promise<unknown> {
    return this.maintenance.tick();
  }
}
