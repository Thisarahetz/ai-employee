import { Controller, Get, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { AiUsageLogsService } from './ai-usage-logs.service';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantContext } from '../../common/tenant/tenant-context';

@Controller('ai-usage-logs')
export class AiUsageLogsController {
  constructor(private readonly usageLogsService: AiUsageLogsService) {}

  @Get('stats')
  async getStats(
    @CurrentTenant() tenant: TenantContext,
    @Query('days', new DefaultValuePipe(14), ParseIntPipe) days: number,
  ) {
    return this.usageLogsService.getStats(tenant.tenantId, days);
  }
}
