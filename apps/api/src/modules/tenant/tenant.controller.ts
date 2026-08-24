import { Body, Controller, Get, Patch } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantContext } from '../../common/tenant/tenant-context';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantService } from './tenant.service';

/** Self-service only: get/update the caller's own tenant. No cross-tenant listing. */
@Controller('tenants')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get()
  getOwn(@CurrentTenant() tenant: TenantContext) {
    return this.tenantService.getOwn(tenant.tenantId);
  }

  @RequirePermissions('tenant:write')
  @Patch()
  updateOwn(@CurrentTenant() tenant: TenantContext, @Body() dto: UpdateTenantDto) {
    return this.tenantService.updateOwn(tenant.tenantId, dto);
  }
}
