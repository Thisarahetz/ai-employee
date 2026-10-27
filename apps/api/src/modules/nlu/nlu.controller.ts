import { Controller, Get, Query } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import type { TenantContext } from '../../common/tenant/tenant-context';
import { NluService } from './nlu.service';

/** How much of the traffic Rasa handles, and why the rest goes to the LLM. */
@Controller('nlu')
export class NluController {
  constructor(private readonly nlu: NluService) {}

  @RequirePermissions('conversations:read')
  @Get('stats')
  stats(@CurrentTenant() t: TenantContext, @Query('days') days?: string) {
    const n = Number(days);
    return this.nlu.stats(t.tenantId, Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 365) : 30);
  }
}
