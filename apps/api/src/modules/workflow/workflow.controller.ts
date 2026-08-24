import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantContext } from '../../common/tenant/tenant-context';
import { WorkflowService } from './workflow.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';

// NOTE: JwtAuthGuard is registered globally (APP_GUARD) in app.module.ts — this
// controller carries no user-facing @Public() routes, so no per-route guard is added
// here (mirrors IntegrationController).
@Controller('workflows')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Post()
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateWorkflowDto) {
    return this.workflowService.create(tenant.tenantId, dto);
  }

  @Get()
  findAll(@CurrentTenant() tenant: TenantContext) {
    return this.workflowService.findAll(tenant.tenantId);
  }

  @Get(':id')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.workflowService.findOne(tenant.tenantId, id);
  }

  @Patch(':id')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateWorkflowDto) {
    return this.workflowService.update(tenant.tenantId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.workflowService.remove(tenant.tenantId, id);
  }

  @Get(':id/executions')
  listExecutions(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.workflowService.listExecutions(tenant.tenantId, id);
  }
}
