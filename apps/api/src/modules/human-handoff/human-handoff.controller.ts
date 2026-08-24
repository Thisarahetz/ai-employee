import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantContext } from '../../common/tenant/tenant-context';
import { CreateHandoffDto } from './dto/create-handoff.dto';
import { ListHandoffsQueryDto } from './dto/list-handoffs-query.dto';
import { ResolveHandoffDto } from './dto/resolve-handoff.dto';
import { HumanHandoffService } from './human-handoff.service';

@Controller('human-handoffs')
export class HumanHandoffController {
  constructor(private readonly humanHandoffService: HumanHandoffService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListHandoffsQueryDto) {
    return this.humanHandoffService.list(tenant.tenantId, query.status);
  }

  @Get(':id')
  get(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.humanHandoffService.get(tenant.tenantId, id);
  }

  @Post()
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateHandoffDto) {
    return this.humanHandoffService.create(tenant.tenantId, dto.conversationId, dto.reason, dto.notes);
  }

  @Post(':id/resolve')
  resolve(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: ResolveHandoffDto,
  ) {
    return this.humanHandoffService.resolve(tenant.tenantId, id, tenant.userId, dto.notes);
  }
}
