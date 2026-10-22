import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantContext } from '../../common/tenant/tenant-context';
import { RequirePermissions } from '../../common/decorators/roles.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { ApplyOptions, BusinessProfile, BusinessSetupService, TemplateInput } from './business-setup.service';

/** Industry templates + business profile for the signed-in business. */
@Controller('business-setup')
export class BusinessSetupController {
  constructor(private readonly setup: BusinessSetupService) {}

  @Get('templates')
  @RequirePermissions('ai_employees:read')
  list(@CurrentTenant() t: TenantContext) {
    return this.setup.listForTenant(t.tenantId);
  }

  @Get('templates/:id')
  @RequirePermissions('ai_employees:read')
  get(@CurrentTenant() t: TenantContext, @Param('id') id: string) {
    return this.setup.getForTenant(t.tenantId, id);
  }

  /** Create your own template, optionally as a copy (`basedOnId`) to customise. */
  @Post('templates')
  @RequirePermissions('ai_employees:manage')
  create(@CurrentTenant() t: TenantContext, @Body() body: TemplateInput & { basedOnId?: string }) {
    return this.setup.createCustom(t.tenantId, t.userId, body ?? {});
  }

  @Patch('templates/:id')
  @RequirePermissions('ai_employees:manage')
  update(@CurrentTenant() t: TenantContext, @Param('id') id: string, @Body() body: TemplateInput) {
    return this.setup.updateCustom(t.tenantId, t.userId, id, body ?? {});
  }

  @Delete('templates/:id')
  @RequirePermissions('ai_employees:manage')
  remove(@CurrentTenant() t: TenantContext, @Param('id') id: string) {
    return this.setup.deleteCustom(t.tenantId, t.userId, id);
  }

  @Post('templates/:id/apply')
  @RequirePermissions('ai_employees:manage')
  apply(@CurrentTenant() t: TenantContext, @Param('id') id: string, @Body() body: ApplyOptions) {
    return this.setup.apply(t.tenantId, t.userId, id, body ?? {});
  }

  /** Step-by-step setup guide for a new business, worked out from real data. */
  @Get('getting-started')
  @RequirePermissions('ai_employees:read')
  gettingStarted(@CurrentTenant() t: TenantContext) {
    return this.setup.gettingStarted(t.tenantId);
  }

  @Put('getting-started')
  @RequirePermissions('businesses:write')
  setGettingStarted(@CurrentTenant() t: TenantContext, @Body() body: { dismissed?: boolean }) {
    return this.setup.setGettingStartedDismissed(t.tenantId, t.userId, body?.dismissed !== false);
  }

  @Get('profile')
  @RequirePermissions('businesses:read')
  getProfile(@CurrentTenant() t: TenantContext, @Query('businessId') businessId?: string) {
    return this.setup.getProfile(t.tenantId, businessId);
  }

  @Put('profile')
  @RequirePermissions('businesses:write')
  updateProfile(@CurrentTenant() t: TenantContext, @Body() body: BusinessProfile & { businessId?: string; timezone?: string; type?: string }) {
    return this.setup.updateProfile(t.tenantId, t.userId, body ?? {});
  }
}

/** Platform-wide template catalog, managed by platform super admins. */
@UseGuards(PlatformAdminGuard)
@Controller('admin/industry-templates')
export class AdminTemplatesController {
  constructor(private readonly setup: BusinessSetupService) {}

  @Get()
  list() {
    return this.setup.adminList();
  }

  @Post()
  create(@CurrentTenant() t: TenantContext, @Body() body: TemplateInput & { key?: string }) {
    return this.setup.adminCreate(t.userId, body ?? {});
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: TemplateInput) {
    return this.setup.adminUpdate(id, body ?? {});
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.setup.adminDelete(id);
  }
}
