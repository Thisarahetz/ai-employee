import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantContext } from '../../common/tenant/tenant-context';
import { PolicySynthesisService } from './policy-synthesis.service';
import { InvariantStatus } from '@prisma/client';

@Controller('policy-invariants')
export class PolicySynthesisController {
  constructor(private readonly policySynthesisService: PolicySynthesisService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext, @Query('status') status?: InvariantStatus) {
    return this.policySynthesisService.listInvariants(tenant.tenantId, status);
  }

  @Post(':id/activate')
  activate(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.policySynthesisService.activateInvariant(tenant.tenantId, id);
  }

  @Post(':id/reject')
  reject(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.policySynthesisService.rejectInvariant(tenant.tenantId, id);
  }

  @Post('synthesize/:handoffId')
  synthesize(@CurrentTenant() tenant: TenantContext, @Param('handoffId') handoffId: string) {
    return this.policySynthesisService.synthesizeFromHandoff(tenant.tenantId, handoffId);
  }
}
