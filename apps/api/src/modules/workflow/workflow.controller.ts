import { Body, Controller, Delete, Get, Param, Patch, Post, BadRequestException } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantContext } from '../../common/tenant/tenant-context';
import { WorkflowService } from './workflow.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { ImportTemplateDto } from './dto/import-template.dto';

// NOTE: JwtAuthGuard is registered globally (APP_GUARD) in app.module.ts.
// Public endpoints (e.g. browsing the template catalog) use @Public().
@Controller('workflows')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Public()
  @Get('templates')
  getTemplates() {
    return this.workflowService.getTemplates();
  }

  @Post('templates/:templateId/import')
  importTemplate(
    @CurrentTenant() tenant: TenantContext,
    @Param('templateId') templateId: string,
    @Body() dto: ImportTemplateDto,
  ) {
    const targetTenantId = tenant?.tenantId || dto.tenantId;
    if (!targetTenantId) {
      throw new BadRequestException('tenantId is required (via JWT or body)');
    }
    return this.workflowService.importTemplate(targetTenantId, templateId, dto);
  }

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
