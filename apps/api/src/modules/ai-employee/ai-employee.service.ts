import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BUSINESS_TEMPLATES } from './ai-employee-templates';

export interface CreateAiEmployeeDto {
  name: string;
  role: string;
  department: string;
  businessFunction: string;
  description: string;
  avatar?: string;
  actionLevel?: 'AUTOMATIC' | 'APPROVAL_REQUIRED' | 'OWNER_ONLY';
  scope?: 'ALL_BRANCHES' | 'SELECTED_BRANCHES';
  branchIds?: string[];
  responsibilities?: string[];
  assignedTasks?: { category: string; task: string; isEnabled: boolean }[];
  permissions?: Record<string, boolean>;
  systemPrompt?: string;
  connectedTools?: string[];
}

export interface UpdateAiEmployeeDto extends Partial<CreateAiEmployeeDto> {
  status?: 'ACTIVE' | 'PAUSED' | 'NEEDS_ATTENTION';
}

@Injectable()
export class AiEmployeeService {
  constructor(private readonly prisma: PrismaService) {}

  async listEmployees(tenantId: string, filters?: { status?: string; department?: string; branchId?: string }) {
    return this.prisma.aiEmployee.findMany({
      where: {
        tenantId,
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.department ? { department: filters.department } : {}),
        ...(filters?.branchId ? { branchIds: { has: filters.branchId } } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getStats(tenantId: string) {
    const [total, active, paused, needsApproval] = await Promise.all([
      this.prisma.aiEmployee.count({ where: { tenantId } }),
      this.prisma.aiEmployee.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.prisma.aiEmployee.count({ where: { tenantId, status: 'PAUSED' } }),
      this.prisma.aiEmployeeApproval.count({ where: { tenantId, status: 'PENDING' } }),
    ]);

    return {
      total,
      active,
      paused,
      needsApproval,
      errors: 0,
    };
  }

  async getEmployee(tenantId: string, id: string) {
    const employee = await this.prisma.aiEmployee.findFirst({
      where: { id, tenantId },
      include: {
        approvals: {
          where: { status: 'PENDING' },
          orderBy: { requestedAt: 'desc' },
        },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!employee) {
      throw new NotFoundException('AI Employee not found');
    }

    return employee;
  }

  async createEmployee(tenantId: string, dto: CreateAiEmployeeDto) {
    const employee = await this.prisma.aiEmployee.create({
      data: {
        tenantId,
        name: dto.name,
        role: dto.role,
        department: dto.department,
        businessFunction: dto.businessFunction,
        description: dto.description,
        avatar: dto.avatar ?? null,
        actionLevel: dto.actionLevel ?? 'AUTOMATIC',
        scope: dto.scope ?? 'ALL_BRANCHES',
        branchIds: dto.branchIds ?? [],
        responsibilities: (dto.responsibilities ?? []) as any,
        assignedTasks: (dto.assignedTasks ?? []) as any,
        permissions: (dto.permissions ?? {}) as any,
        systemPrompt: dto.systemPrompt ?? '',
        connectedTools: dto.connectedTools ?? [],
        stats: {
          conversations: 0,
          ordersAssisted: 0,
          tasksCompleted: 0,
          successRate: 98,
        },
      },
    });

    // Record creation activity
    await this.prisma.aiEmployeeActivity.create({
      data: {
        tenantId,
        employeeId: employee.id,
        action: `AI Employee hired: ${employee.name}`,
        category: 'OPERATIONS',
        details: `Assigned role ${employee.role} in ${employee.department} department.`,
        status: 'SUCCESS',
      },
    });

    return employee;
  }

  async updateEmployee(tenantId: string, id: string, dto: UpdateAiEmployeeDto) {
    await this.getEmployee(tenantId, id);

    return this.prisma.aiEmployee.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.department !== undefined ? { department: dto.department } : {}),
        ...(dto.businessFunction !== undefined ? { businessFunction: dto.businessFunction } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.avatar !== undefined ? { avatar: dto.avatar } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.actionLevel !== undefined ? { actionLevel: dto.actionLevel } : {}),
        ...(dto.scope !== undefined ? { scope: dto.scope } : {}),
        ...(dto.branchIds !== undefined ? { branchIds: dto.branchIds } : {}),
        ...(dto.responsibilities !== undefined ? { responsibilities: dto.responsibilities as any } : {}),
        ...(dto.assignedTasks !== undefined ? { assignedTasks: dto.assignedTasks as any } : {}),
        ...(dto.permissions !== undefined ? { permissions: dto.permissions as any } : {}),
        ...(dto.systemPrompt !== undefined ? { systemPrompt: dto.systemPrompt } : {}),
        ...(dto.connectedTools !== undefined ? { connectedTools: dto.connectedTools } : {}),
      },
    });
  }

  async toggleStatus(tenantId: string, id: string, status: 'ACTIVE' | 'PAUSED') {
    const employee = await this.getEmployee(tenantId, id);

    const updated = await this.prisma.aiEmployee.update({
      where: { id: employee.id },
      data: { status },
    });

    await this.prisma.aiEmployeeActivity.create({
      data: {
        tenantId,
        employeeId: employee.id,
        action: `Status changed to ${status}`,
        category: 'OPERATIONS',
        details: `Employee ${employee.name} was ${status === 'ACTIVE' ? 'activated' : 'paused'} by owner.`,
        status: 'SUCCESS',
      },
    });

    return updated;
  }

  async deleteEmployee(tenantId: string, id: string) {
    await this.getEmployee(tenantId, id);
    return this.prisma.aiEmployee.delete({
      where: { id },
    });
  }

  getTemplates() {
    return Object.values(BUSINESS_TEMPLATES).map((tmpl) => ({
      id: tmpl.id,
      name: tmpl.name,
      category: tmpl.category,
      icon: tmpl.icon,
      description: tmpl.description,
      employeeCount: tmpl.suggestedEmployees.length,
      employees: tmpl.suggestedEmployees.map((e) => ({
        key: e.key,
        name: e.name,
        role: e.role,
        department: e.department,
        description: e.description,
        actionLevel: e.actionLevel,
      })),
    }));
  }

  async applyTemplate(
    tenantId: string,
    businessType: string,
    businessSize: 'SMALL' | 'MEDIUM' | 'LARGE' | 'ENTERPRISE' = 'SMALL',
    selectedKeys?: string[],
  ) {
    const template = BUSINESS_TEMPLATES[businessType] || BUSINESS_TEMPLATES.PHONE_SHOP;
    if (!template) {
      throw new NotFoundException(`Template not found for business type: ${businessType}`);
    }

    const employeesToCreate = selectedKeys && selectedKeys.length > 0
      ? template.suggestedEmployees.filter((e) => selectedKeys.includes(e.key))
      : template.suggestedEmployees;

    const createdEmployees = [];

    for (const suggested of employeesToCreate) {
      // Check if employee with same role already exists for tenant
      const existing = await this.prisma.aiEmployee.findFirst({
        where: { tenantId, role: suggested.role },
      });

      if (existing) {
        createdEmployees.push(existing);
        continue;
      }

      // Initial realistic demo stats
      const baseConversations = businessSize === 'ENTERPRISE' ? 420 : businessSize === 'LARGE' ? 248 : 86;
      const baseOrders = Math.floor(baseConversations * 0.32);

      const emp = await this.prisma.aiEmployee.create({
        data: {
          tenantId,
          name: suggested.name,
          role: suggested.role,
          department: suggested.department,
          businessFunction: suggested.businessFunction,
          description: suggested.description,
          actionLevel: suggested.actionLevel,
          scope: 'ALL_BRANCHES',
          responsibilities: suggested.responsibilities as any,
          assignedTasks: suggested.assignedTasks as any,
          permissions: suggested.permissions as any,
          systemPrompt: suggested.systemPrompt,
          status: 'ACTIVE',
          stats: {
            conversations: baseConversations,
            ordersAssisted: baseOrders,
            tasksCompleted: Math.floor(baseConversations * 0.85),
            leadsGenerated: Math.floor(baseConversations * 0.18),
            escalations: 2,
            successRate: 96,
          },
        },
      });

      // Seed initial realistic activity entries
      await this.prisma.aiEmployeeActivity.createMany({
        data: [
          {
            tenantId,
            employeeId: emp.id,
            action: `Employee initialized: ${emp.name}`,
            category: 'OPERATIONS',
            details: `Installed from ${template.name} template for ${businessSize.toLowerCase()} business.`,
            status: 'SUCCESS',
            createdAt: new Date(Date.now() - 3600 * 1000 * 4),
          },
          {
            tenantId,
            employeeId: emp.id,
            action: `Handled customer consultation`,
            category: 'CUSTOMER',
            details: `Answered product compatibility and pricing query.`,
            status: 'SUCCESS',
            createdAt: new Date(Date.now() - 3600 * 1000 * 2),
          },
        ],
      });

      // If approval required, seed an approval item for demo review
      if (suggested.actionLevel === 'APPROVAL_REQUIRED') {
        await this.prisma.aiEmployeeApproval.create({
          data: {
            tenantId,
            employeeId: emp.id,
            title: `Supplier Reorder Draft: Fast-Moving Inventory`,
            description: `Stock level dropped below safety buffer. Draft reorder for 20 units ($1,250 total).`,
            actionType: 'PURCHASE_ORDER',
            actionPayload: { itemsCount: 20, estimatedCostUsd: 1250 },
            status: 'PENDING',
          },
        });
      }

      createdEmployees.push(emp);
    }

    return {
      templateName: template.name,
      installedCount: createdEmployees.length,
      employees: createdEmployees,
    };
  }

  /**
   * Enforces permissions and autonomy level for an AI Employee attempting an action.
   */
  async checkActionPermission(
    tenantId: string,
    employeeId: string,
    actionKey: string,
    actionTitle: string,
    payload: Record<string, any> = {},
  ) {
    const employee = await this.getEmployee(tenantId, employeeId);

    if (employee.status !== 'ACTIVE') {
      return {
        allowed: false,
        reason: `${employee.name} is currently paused by the business owner. Actions cannot be performed until reactivated.`,
      };
    }

    const perms = (employee.permissions || {}) as Record<string, boolean>;

    // 1. Check Level 3: Strictly Restricted actions
    const strictlyRestricted = ['deleteProducts', 'deleteEmployees', 'changeSettings', 'transferMoney'];
    if (strictlyRestricted.includes(actionKey)) {
      await this.prisma.aiEmployeeActivity.create({
        data: {
          tenantId,
          employeeId: employee.id,
          action: `Blocked restricted action: ${actionTitle}`,
          category: 'OPERATIONS',
          details: `Attempted restricted action (${actionKey}) which is reserved for business owner only.`,
          status: 'REJECTED',
        },
      });

      return {
        allowed: false,
        reason: `Operation is restricted to the business owner only and cannot be executed autonomously by AI.`,
      };
    }

    // 2. Check Level 2: Approval Required actions
    const approvalRequiredKeys = ['editPrices', 'refundMoney', 'createPurchaseOrders', 'largeDiscount'];
    const isApprovalRequired =
      employee.actionLevel === 'APPROVAL_REQUIRED' ||
      approvalRequiredKeys.includes(actionKey) ||
      (payload.amount && Number(payload.amount) > 100);

    if (isApprovalRequired) {
      const approval = await this.prisma.aiEmployeeApproval.create({
        data: {
          tenantId,
          employeeId: employee.id,
          title: actionTitle,
          description: `Action requires owner authorization: ${actionKey}`,
          actionType: actionKey.toUpperCase(),
          actionPayload: payload as any,
          status: 'PENDING',
        },
      });

      await this.prisma.aiEmployeeActivity.create({
        data: {
          tenantId,
          employeeId: employee.id,
          action: `Submitted for owner approval: ${actionTitle}`,
          category: 'OPERATIONS',
          details: `Requires owner review before executing (${actionKey}).`,
          status: 'PENDING_APPROVAL',
        },
      });

      return {
        allowed: false,
        requiresApproval: true,
        approvalId: approval.id,
        reason: `Action prepared and submitted for business owner approval.`,
      };
    }

    // 3. Check explicit permission toggle if specified
    if (perms[actionKey] === false) {
      return {
        allowed: false,
        reason: `${employee.name} does not have the "${actionKey}" permission enabled in settings.`,
      };
    }

    return {
      allowed: true,
      reason: `Action permitted under Level 1 Automatic policy.`,
    };
  }
}

