import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Ip, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantContext } from '../../common/tenant/tenant-context';
import { UpdateTenantDto } from '../tenant/dto/update-tenant.dto';
import { AdminListQueryDto } from './dto/admin-list-query.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AdminService, AdminActor } from './admin.service';

/** Cross-tenant platform administration. Requires User.platformRole SUPER_ADMIN, not a tenant Role. */
@UseGuards(PlatformAdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  getStats() {
    return this.adminService.getPlatformStats();
  }

  @Post('tenants')
  createTenant(@Body() dto: CreateTenantDto, @CurrentTenant() ctx: TenantContext, @Ip() ip: string) {
    return this.adminService.createTenant(dto, this.actor(ctx, ip));
  }

  @Get('tenants')
  listTenants(@Query() query: AdminListQueryDto) {
    return this.adminService.listTenants(query);
  }

  @Get('tenants/:id')
  getTenant(@Param('id') id: string) {
    return this.adminService.getTenant(id);
  }

  @Get('tenants/:id/users')
  listTenantUsers(@Param('id') id: string) {
    return this.adminService.listTenantUsers(id);
  }

  @Patch('tenants/:id')
  updateTenant(
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
    @CurrentTenant() ctx: TenantContext,
    @Ip() ip: string,
  ) {
    return this.adminService.updateTenant(id, dto, this.actor(ctx, ip));
  }

  @Delete('tenants/:id')
  deleteTenant(@Param('id') id: string, @CurrentTenant() ctx: TenantContext, @Ip() ip: string) {
    return this.adminService.deleteTenant(id, this.actor(ctx, ip));
  }

  @Get('users')
  listUsers(@Query() query: AdminListQueryDto) {
    return this.adminService.listUsers(query);
  }

  @Get('users/:id')
  getUser(@Param('id') id: string) {
    return this.adminService.getUser(id);
  }

  @Patch('users/:id')
  updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentTenant() ctx: TenantContext,
    @Ip() ip: string,
  ) {
    return this.adminService.updateUser(id, dto, this.actor(ctx, ip));
  }

  @Get('ai-employees')
  listAiEmployees(@Query() query: AdminListQueryDto) {
    return this.adminService.listPlatformAiEmployees(query);
  }

  @Patch('ai-employees/:id/status')
  updateAiEmployeeStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @CurrentTenant() ctx: TenantContext,
    @Ip() ip: string,
  ) {
    return this.adminService.updateAiEmployeeStatus(id, status, this.actor(ctx, ip));
  }

  @Get('ai-templates')
  getAiTemplates() {
    return this.adminService.getAiTemplatesCatalog();
  }

  @Get('business-types')
  getBusinessTypes() {
    return this.adminService.getBusinessTypesCatalog();
  }

  @Get('plans')
  getPlans() {
    return this.adminService.getPlatformPlans();
  }

  @Get('usage')
  getUsage() {
    return this.adminService.getPlatformUsage();
  }

  @Get('health')
  getHealth() {
    return this.adminService.getSystemHealth();
  }

  @Get('settings')
  getSettings() {
    return this.adminService.getPlatformSettings();
  }

  @Get('audit-log')
  listAuditLog(
    @Query('targetType') targetType?: string,
    @Query('targetId') targetId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.adminService.listAuditLog({
      targetType,
      targetId,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  private actor(ctx: TenantContext, ip: string): AdminActor {
    return { userId: ctx.userId, ipAddress: ip };
  }
}

