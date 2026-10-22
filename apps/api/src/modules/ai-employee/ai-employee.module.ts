import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AiEmployeeController } from './ai-employee.controller';
import { AiEmployeeService } from './ai-employee.service';
import { AiEmployeeApprovalService } from './ai-employee-approval.service';
import { AiEmployeeActivityService } from './ai-employee-activity.service';
import { OwnerAuthorityService } from '../../common/authz/owner-authority.service';

@Module({
  imports: [PrismaModule, NotificationModule, AuditLogModule],
  controllers: [AiEmployeeController],
  providers: [
    AiEmployeeService,
    AiEmployeeApprovalService,
    AiEmployeeActivityService,
    OwnerAuthorityService,
  ],
  exports: [
    AiEmployeeService,
    AiEmployeeApprovalService,
    AiEmployeeActivityService,
  ],
})
export class AiEmployeeModule {}
