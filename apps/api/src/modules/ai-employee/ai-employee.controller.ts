import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantContext } from '../../common/tenant/tenant-context';
import {
  AiEmployeeService,
  CreateAiEmployeeDto,
  UpdateAiEmployeeDto,
} from './ai-employee.service';
import { AiEmployeeApprovalService } from './ai-employee-approval.service';
import { AiEmployeeActivityService } from './ai-employee-activity.service';

@Controller('ai-employees')
export class AiEmployeeController {
  constructor(
    private readonly employeeService: AiEmployeeService,
    private readonly approvalService: AiEmployeeApprovalService,
    private readonly activityService: AiEmployeeActivityService,
  ) {}

  @Get()
  async listEmployees(
    @CurrentTenant() tenant: TenantContext,
    @Query('status') status?: string,
    @Query('department') department?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.employeeService.listEmployees(tenant.tenantId, {
      status,
      department,
      branchId,
    });
  }

  @Get('stats')
  async getStats(@CurrentTenant() tenant: TenantContext) {
    return this.employeeService.getStats(tenant.tenantId);
  }

  @Get('templates')
  getTemplates() {
    return this.employeeService.getTemplates();
  }

  @Post('templates/apply')
  async applyTemplate(
    @CurrentTenant() tenant: TenantContext,
    @Body()
    body: {
      businessType: string;
      businessSize?: 'SMALL' | 'MEDIUM' | 'LARGE' | 'ENTERPRISE';
      selectedKeys?: string[];
    },
  ) {
    return this.employeeService.applyTemplate(
      tenant.tenantId,
      body.businessType,
      body.businessSize,
      body.selectedKeys,
    );
  }

  @Get('approvals')
  async listApprovals(
    @CurrentTenant() tenant: TenantContext,
    @Query('status') status?: string,
  ) {
    return this.approvalService.listApprovals(tenant.tenantId, status);
  }

  @Post('approvals/:id/review')
  async reviewApproval(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: { decision: 'APPROVED' | 'REJECTED'; reviewNotes?: string },
  ) {
    return this.approvalService.reviewApproval(
      tenant.tenantId,
      id,
      tenant.userId,
      body.decision,
      body.reviewNotes,
    );
  }

  @Get('activities')
  async listActivities(
    @CurrentTenant() tenant: TenantContext,
    @Query('employeeId') employeeId?: string,
    @Query('category') category?: string,
    @Query('branchId') branchId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.activityService.listActivities(tenant.tenantId, {
      employeeId,
      category,
      branchId,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  async getEmployee(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.employeeService.getEmployee(tenant.tenantId, id);
  }

  @Post()
  async createEmployee(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateAiEmployeeDto,
  ) {
    return this.employeeService.createEmployee(tenant.tenantId, dto);
  }

  @Patch(':id')
  async updateEmployee(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateAiEmployeeDto,
  ) {
    return this.employeeService.updateEmployee(tenant.tenantId, id, dto);
  }

  @Patch(':id/status')
  async toggleStatus(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: { status: 'ACTIVE' | 'PAUSED' },
  ) {
    return this.employeeService.toggleStatus(tenant.tenantId, id, body.status);
  }

  @Delete(':id')
  async deleteEmployee(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.employeeService.deleteEmployee(tenant.tenantId, id);
  }

  @Post(':id/check-action')
  async checkActionPermission(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body()
    body: {
      actionKey: string;
      actionTitle: string;
      payload?: Record<string, any>;
    },
  ) {
    return this.employeeService.checkActionPermission(
      tenant.tenantId,
      id,
      body.actionKey,
      body.actionTitle,
      body.payload,
    );
  }
}
