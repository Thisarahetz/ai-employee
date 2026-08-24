import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantContext } from '../../common/tenant/tenant-context';
import { ChannelService } from './channel.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { CreateChannelCredentialDto } from './dto/create-channel-credential.dto';

// NOTE: JwtAuthGuard is registered globally (APP_GUARD) in app.module.ts — this
// controller carries no user-facing @Public() routes, so no per-route guard is added
// here (mirrors IntegrationController).
@Controller('channels')
export class ChannelController {
  constructor(private readonly channelService: ChannelService) {}

  @Post()
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateChannelDto) {
    return this.channelService.create(tenant.tenantId, dto);
  }

  @Get()
  findAll(@CurrentTenant() tenant: TenantContext) {
    return this.channelService.findAll(tenant.tenantId);
  }

  @Get(':id')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.channelService.findOne(tenant.tenantId, id);
  }

  @Patch(':id')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateChannelDto) {
    return this.channelService.update(tenant.tenantId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.channelService.remove(tenant.tenantId, id);
  }

  @Post(':id/credentials')
  addCredential(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: CreateChannelCredentialDto,
  ) {
    return this.channelService.addCredential(tenant.tenantId, id, dto);
  }
}
