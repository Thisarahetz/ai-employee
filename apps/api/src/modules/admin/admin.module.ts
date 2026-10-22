import { Module } from '@nestjs/common';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { AuthModule } from '../auth/auth.module';
import { AiWorkforceModule } from '../ai-workforce/ai-workforce.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminMonitoringController } from './admin-monitoring.controller';
import { AdminMonitoringService } from './admin-monitoring.service';

@Module({
  imports: [AuthModule, AiWorkforceModule],
  controllers: [AdminController, AdminMonitoringController],
  providers: [AdminService, AdminMonitoringService, PlatformAdminGuard],
})
export class AdminModule {}
