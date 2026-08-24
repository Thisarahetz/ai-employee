import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantContext } from '../../common/tenant/tenant-context';
import { BusinessService } from './business.service';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';

@Controller('businesses')
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.businessService.list(tenant.tenantId);
  }

  @Get(':id')
  get(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.businessService.get(tenant.tenantId, id);
  }

  @RequirePermissions('businesses:write')
  @Post()
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateBusinessDto) {
    return this.businessService.create(tenant.tenantId, dto);
  }

  @RequirePermissions('businesses:write')
  @Patch(':id')
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateBusinessDto,
  ) {
    return this.businessService.update(tenant.tenantId, id, dto);
  }

  @RequirePermissions('businesses:write')
  @Delete(':id')
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.businessService.remove(tenant.tenantId, id);
  }
}
