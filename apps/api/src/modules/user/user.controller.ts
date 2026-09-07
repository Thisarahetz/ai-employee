import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantContext } from '../../common/tenant/tenant-context';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';
import { UserService } from './user.service';

/** Tenant Team & Staff management */
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @RequirePermissions('users:read')
  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.userService.list(tenant.tenantId);
  }

  @RequirePermissions('users:read')
  @Get('roles/templates')
  getRoleTemplates(@CurrentTenant() tenant: TenantContext) {
    return this.userService.getRoleTemplates(tenant.tenantId);
  }

  @RequirePermissions('users:read')
  @Get(':id')
  get(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.userService.get(tenant.tenantId, id);
  }

  @RequirePermissions('users:invite')
  @Post('invite')
  invite(@CurrentTenant() tenant: TenantContext, @Body() dto: InviteUserDto) {
    return this.userService.invite(tenant.tenantId, dto, tenant);
  }

  @RequirePermissions('users:write')
  @Patch(':id')
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateMembershipDto,
  ) {
    return this.userService.update(tenant.tenantId, id, dto, tenant);
  }

  @RequirePermissions('users:invite')
  @Post(':id/resend-invite')
  resendInvite(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.userService.resendInvite(tenant.tenantId, id, tenant);
  }

  @RequirePermissions('users:write')
  @Post(':id/cancel-invite')
  cancelInvite(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.userService.cancelInvite(tenant.tenantId, id, tenant);
  }

  @RequirePermissions('users:write')
  @Delete(':id')
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.userService.remove(tenant.tenantId, id, tenant);
  }
}
