import { Body, Controller, Get, Ip, Param, Put, Query, UseGuards } from '@nestjs/common';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantContext } from '../../common/tenant/tenant-context';
import type { AiLimits } from '../ai-workforce/usage-limits.service';
import { AdminMonitoringService } from './admin-monitoring.service';

/** Platform-wide AI cost and health. SUPER_ADMIN only. */
@UseGuards(PlatformAdminGuard)
@Controller('admin')
export class AdminMonitoringController {
  constructor(private readonly monitoring: AdminMonitoringService) {}

  @Get('ai-usage')
  aiUsage(@Query('days') days?: string) {
    return this.monitoring.aiUsage(days ? Number(days) : undefined);
  }

  @Get('system-health')
  systemHealth() {
    return this.monitoring.systemHealth();
  }

  @Get('tenants/:id/ai-limits')
  tenantLimits(@Param('id') id: string) {
    return this.monitoring.tenantLimits(id);
  }

  @Put('tenants/:id/ai-limits')
  setTenantLimits(
    @CurrentTenant() t: TenantContext,
    @Ip() ip: string,
    @Param('id') id: string,
    @Body() body: Partial<Record<keyof AiLimits, unknown>>,
  ) {
    return this.monitoring.setTenantLimits(id, body ?? {}, { userId: t.userId, ipAddress: ip });
  }
}
