import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AiWorkforceModule } from '../ai-workforce/ai-workforce.module';
import { AdminTemplatesController, BusinessSetupController } from './business-setup.controller';
import { BusinessSetupService } from './business-setup.service';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';

@Module({
  imports: [PrismaModule, AuditLogModule, AiWorkforceModule],
  controllers: [BusinessSetupController, AdminTemplatesController],
  providers: [BusinessSetupService, PlatformAdminGuard],
  exports: [BusinessSetupService],
})
export class BusinessSetupModule {}
