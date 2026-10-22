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
import { ModuleRef } from '@nestjs/core';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantContext } from '../../common/tenant/tenant-context';
import { RequirePermissions } from '../../common/decorators/roles.decorator';
import {
  AiEmployeeService,
  CreateAiEmployeeDto,
  UpdateAiEmployeeDto,
} from './ai-employee.service';
import { AiEmployeeApprovalService } from './ai-employee-approval.service';
import { AiEmployeeActivityService } from './ai-employee-activity.service';
import { OwnerAuthorityService } from '../../common/authz/owner-authority.service';
import { WorkforceApprovalService } from '../ai-workforce/workforce-approval.service';

/** Fields that change what an AI employee is allowed to do. */
const ACCESS_FIELDS = ['permissions', 'actionLevel', 'connectedTools'] as const;

@Controller('ai-employees')
export class AiEmployeeController {
  constructor(
    private readonly employeeService: AiEmployeeService,
    private readonly approvalService: AiEmployeeApprovalService,
    private readonly activityService: AiEmployeeActivityService,
    private readonly authority: OwnerAuthorityService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * Looked up at request time: AiWorkforceModule imports this module, so it
   * can't be injected here without a circular module dependency.
   */
  private workforceApprovals(): WorkforceApprovalService {
    return this.moduleRef.get(WorkforceApprovalService, { strict: false });
  }

  @Get()
  @RequirePermissions('ai_employees:read')
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
  @RequirePermissions('ai_employees:read')
  async getStats(@CurrentTenant() tenant: TenantContext) {
    return this.employeeService.getStats(tenant.tenantId);
  }

  @Get('approvals')
  @RequirePermissions('ai_employees:read')
  async listApprovals(
    @CurrentTenant() tenant: TenantContext,
    @Query('status') status?: string,
  ) {
    return this.approvalService.listApprovals(tenant.tenantId, status);
  }

  @Post('approvals/:id/review')
  @RequirePermissions('ai_employees:approve')
  async reviewApproval(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: { decision: 'APPROVED' | 'REJECTED'; reviewNotes?: string },
  ) {
    // Same path as /ai-workforce/approvals/:id/decide: live authority check,
    // pending-only claim, and one-time execution of attached tool calls.
    const approvals = this.workforceApprovals();
    return approvals.decide(tenant.tenantId, tenant.userId, id, body.decision, body.reviewNotes);
  }

  @Get('activities')
  @RequirePermissions('ai_employees:read')
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
  @RequirePermissions('ai_employees:read')
  async getEmployee(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.employeeService.getEmployee(tenant.tenantId, id);
  }

  @Post()
  @RequirePermissions('ai_employees:manage')
  async createEmployee(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateAiEmployeeDto,
  ) {
    return this.employeeService.createEmployee(tenant.tenantId, dto);
  }

  @Patch(':id')
  @RequirePermissions('ai_employees:manage')
  async updateEmployee(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateAiEmployeeDto,
  ) {
    if (ACCESS_FIELDS.some((f) => (dto as Record<string, unknown>)[f] !== undefined)) {
      await this.authority.assert(tenant.tenantId, tenant.userId, 'ai_employees:manage');
    }
    return this.employeeService.updateEmployee(tenant.tenantId, id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('ai_employees:manage')
  async toggleStatus(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: { status: 'ACTIVE' | 'PAUSED' },
  ) {
    return this.employeeService.toggleStatus(tenant.tenantId, id, body.status);
  }

  @Delete(':id')
  @RequirePermissions('ai_employees:manage')
  async deleteEmployee(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.employeeService.deleteEmployee(tenant.tenantId, id);
  }

  @Post(':id/check-action')
  @RequirePermissions('ai_employees:read')
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
