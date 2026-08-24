import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { UpdateTenantDto } from '../tenant/dto/update-tenant.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { AdminService } from './admin.service';

/** Cross-tenant platform administration. Requires User.isPlatformAdmin, not a tenant Role. */
@UseGuards(PlatformAdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('tenants')
  createTenant(@Body() dto: CreateTenantDto) {
    return this.adminService.createTenant(dto);
  }

  @Get('tenants')
  listTenants() {
    return this.adminService.listTenants();
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
  updateTenant(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.adminService.updateTenant(id, dto);
  }

  @Get('users')
  listUsers() {
    return this.adminService.listUsers();
  }
}
