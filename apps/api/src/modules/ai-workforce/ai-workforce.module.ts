import { Module } from '@nestjs/common';
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

@Module({
  imports: [PrismaModule, AuditLogModule, NotificationModule, RagModule, ExternalActionModule, AiProviderModule, AiEmployeeModule],
  controllers: [AiWorkforceController],
  providers: [
    OwnerAuthorityService,
    WorkforceCommandService,
    WorkforceTaskService,
    WorkforceToolExecutorService,
    TaskExecutorService,
    WorkforceApprovalService,
    WorkforceAccessService,
  ],
  exports: [WorkforceApprovalService, WorkforceTaskService],
})
export class AiWorkforceModule {}
