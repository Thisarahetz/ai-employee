import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/roles.decorator';
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
  @RequirePermissions('integrations:manage')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateIntegrationDto) {
    return this.integrationService.create(tenant.tenantId, dto);
  }

  @Get()
  @RequirePermissions('integrations:read')
  findAll(@CurrentTenant() tenant: TenantContext) {
    return this.integrationService.findAll(tenant.tenantId);
  }

  @Get(':id')
  @RequirePermissions('integrations:read')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.integrationService.getForApi(tenant.tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions('integrations:manage')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateIntegrationDto) {
    return this.integrationService.update(tenant.tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('integrations:manage')
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.integrationService.remove(tenant.tenantId, id);
  }

  /** Issues a new inbound-webhook secret (shown once); the old one stops working. */
  @Post(':id/webhook-secret')
  @RequirePermissions('integrations:manage')
  rotateWebhookSecret(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.integrationService.rotateWebhookSecret(tenant.tenantId, id);
  }

  @Post(':id/credentials')
  @RequirePermissions('integrations:manage')
  addCredential(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: CreateIntegrationCredentialDto,
  ) {
    return this.integrationService.addCredential(tenant.tenantId, id, dto);
  }

  @Post('developer-kit')
  @RequirePermissions('integrations:manage')
  createKit(@CurrentTenant() tenant: TenantContext, @Body() body: { name?: string }) {
    return this.integrationService.createDeveloperKit(tenant.tenantId, body?.name ?? '');
  }

  @Post(':id/developer-kit')
  @RequirePermissions('integrations:manage')
  renewKit(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.integrationService.renewDeveloperKit(tenant.tenantId, id);
  }

  @Post(':id/test')
  @RequirePermissions('integrations:manage')
  test(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.integrationService.testConnection(tenant.tenantId, id);
  }

  @Post(':id/discover')
  @RequirePermissions('integrations:manage')
  discover(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.integrationService.discover(tenant.tenantId, id);
  }

  @Get(':id/actions')
  @RequirePermissions('integrations:read')
  listActions(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.integrationService.listActions(tenant.tenantId, id);
  }

  @Post(':id/knowledge/sync')
  @RequirePermissions('integrations:manage')
  syncKnowledge(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.integrationService.syncKnowledge(tenant.tenantId, id);
  }

  @Get(':id/knowledge')
  @RequirePermissions('integrations:read')
  listSyncedKnowledge(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.integrationService.listSyncedKnowledge(tenant.tenantId, id);
  }

  @Post(':id/execute')
  @RequirePermissions('integrations:manage')
  execute(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: { action: string; data: Record<string, unknown> },
  ) {
    return this.integrationService.execute(tenant.tenantId, id, body.action, body.data ?? {});
  }
}
