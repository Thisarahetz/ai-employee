import { Controller, Get, Patch, Param, Body } from '@nestjs/common';
import { AiAgentConfigService, UpdateAgentConfigurationDto } from './ai-agent-config.service';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantContext } from '../../common/tenant/tenant-context';
import { AgentType } from '@prisma/client';
import { RequirePermissions } from '../../common/decorators/roles.decorator';

@Controller('ai-agents')
export class AiAgentController {
  constructor(private readonly configService: AiAgentConfigService) {}

  @Get()
  @RequirePermissions('ai:configure')
  async getAgents(@CurrentTenant() tenant: TenantContext) {
    return this.configService.getAgents(tenant.tenantId);
  }

  @Patch(':type/configuration')
  @RequirePermissions('ai:configure')
  async updateConfiguration(
    @CurrentTenant() tenant: TenantContext,
    @Param('type') type: AgentType,
    @Body() dto: UpdateAgentConfigurationDto,
  ) {
    return this.configService.updateConfiguration(tenant.tenantId, type, dto);
  }
}
