import { Body, Controller, Get, Ip, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
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
