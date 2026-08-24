import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantContext } from '../../common/tenant/tenant-context';
import { IntegrationService } from './integration.service';
import { CreateIntegrationDto } from './dto/create-integration.dto';
import { UpdateIntegrationDto } from './dto/update-integration.dto';
import { CreateIntegrationCredentialDto } from './dto/create-credential.dto';

// NOTE: assumes JwtAuthGuard is registered globally (APP_GUARD) in app.module.ts
// (Agent 1) with @Public() as the opt-out — this controller carries no user-facing
// @Public() routes, so no per-route guard wiring is added here.
@Controller('integrations')
export class IntegrationController {
  constructor(private readonly integrationService: IntegrationService) {}

  @Post()
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateIntegrationDto) {
    return this.integrationService.create(tenant.tenantId, dto);
  }

  @Get()
  findAll(@CurrentTenant() tenant: TenantContext) {
    return this.integrationService.findAll(tenant.tenantId);
  }

  @Get(':id')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.integrationService.findOne(tenant.tenantId, id);
  }

  @Patch(':id')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateIntegrationDto) {
    return this.integrationService.update(tenant.tenantId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.integrationService.remove(tenant.tenantId, id);
  }

  @Post(':id/credentials')
  addCredential(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: CreateIntegrationCredentialDto,
  ) {
    return this.integrationService.addCredential(tenant.tenantId, id, dto);
  }

  @Post(':id/discover')
  discover(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.integrationService.discover(tenant.tenantId, id);
  }

  @Get(':id/actions')
  listActions(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.integrationService.listActions(tenant.tenantId, id);
  }
}
