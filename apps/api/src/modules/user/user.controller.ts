import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantContext } from '../../common/tenant/tenant-context';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';
import { UserService } from './user.service';

/** Tenant "Team" management — see UserService's doc comment. */
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.userService.list(tenant.tenantId);
  }

  @Get(':id')
  get(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.userService.get(tenant.tenantId, id);
  }

  @RequirePermissions('users:invite')
  @Post('invite')
  invite(@CurrentTenant() tenant: TenantContext, @Body() dto: InviteUserDto) {
    return this.userService.invite(tenant.tenantId, dto);
  }

  @RequirePermissions('users:write')
  @Patch(':id')
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateMembershipDto,
  ) {
    return this.userService.update(tenant.tenantId, id, dto);
  }

  @RequirePermissions('users:write')
  @Delete(':id')
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.userService.remove(tenant.tenantId, id);
  }
}
