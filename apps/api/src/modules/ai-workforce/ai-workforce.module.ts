import { Module, Provider } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { NotificationModule } from '../notification/notification.module';
import { RagModule } from '../rag/rag.module';
import { ExternalActionModule } from '../external-action/external-action.module';
import { AiProviderModule } from '../ai-provider/ai-provider.module';
import { AiEmployeeModule } from '../ai-employee/ai-employee.module';
import { OwnerAuthorityService } from '../../common/authz/owner-authority.service';
import { AiWorkforceController } from './ai-workforce.controller';
import { WorkforceCommandService } from './workforce-command.service';
import { WorkforceTaskService } from './workforce-task.service';
import { WorkforceToolExecutorService } from './workforce-tool-executor.service';
import { TaskExecutorService } from './task-executor.service';
import { WorkforceApprovalService } from './workforce-approval.service';
import { WorkforceAccessService } from './workforce-access.service';
import { WorkforceScheduleService } from './workforce-schedule.service';
import { WorkforceMaintenanceService } from './workforce-maintenance.service';
import { UsageLimitsService } from './usage-limits.service';
import { AutomationRuleService } from './automation-rule.service';
import { MAINTENANCE_QUEUE, TASK_QUEUE, TaskQueueService } from './task-queue.service';
import { MaintenanceProcessor, TaskWorkerProcessor } from './workforce-workers';

/**
 * Set AI_WORKFORCE_WORKER=false on API-only instances to keep them from
 * executing tasks (run dedicated worker instances instead).
 */
const workers: Provider[] = process.env.AI_WORKFORCE_WORKER === 'false' ? [] : [TaskWorkerProcessor, MaintenanceProcessor];

@Module({
  imports: [
    PrismaModule,
    AuditLogModule,
    NotificationModule,
    RagModule,
    ExternalActionModule,
    AiProviderModule,
    AiEmployeeModule,
    BullModule.registerQueue({ name: TASK_QUEUE }, { name: MAINTENANCE_QUEUE }),
  ],
  controllers: [AiWorkforceController],
  providers: [
    OwnerAuthorityService,
    UsageLimitsService,
    TaskQueueService,
    WorkforceCommandService,
    WorkforceTaskService,
    WorkforceToolExecutorService,
    TaskExecutorService,
    WorkforceApprovalService,
    WorkforceAccessService,
    WorkforceScheduleService,
    WorkforceMaintenanceService,
    AutomationRuleService,
    ...workers,
  ],
  exports: [WorkforceApprovalService, WorkforceTaskService, UsageLimitsService, WorkforceScheduleService, AutomationRuleService, TaskQueueService],
})
export class AiWorkforceModule {}
