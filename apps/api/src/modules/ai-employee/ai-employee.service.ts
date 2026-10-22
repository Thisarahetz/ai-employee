import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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

export interface EmployeeStats {
  tasksCompleted: number;
  tasksFailed: number;
  tasksActive: number;
  successRate: number | null;
  pendingApprovals: number;
  costUsd30d: number;
  lastActiveAt: Date | null;
}

export interface UpdateAiEmployeeDto extends Partial<CreateAiEmployeeDto> {
  status?: 'ACTIVE' | 'PAUSED' | 'NEEDS_ATTENTION';
}

@Injectable()
export class AiEmployeeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Performance figures derived from the employee's real task history — never
   * stored counters or defaults. `successRate` is null until there is at
   * least one finished task.
   */
  async computeStats(tenantId: string, employeeIds: string[]): Promise<Map<string, EmployeeStats>> {
    const out = new Map<string, EmployeeStats>();
    if (!employeeIds.length) return out;
    const since30 = new Date(Date.now() - 30 * 86400e3);
    const [byStatus, cost, approvals, last] = await Promise.all([
      this.prisma.aiTask.groupBy({
        by: ['employeeId', 'status'],
        where: { tenantId, employeeId: { in: employeeIds }, kind: { not: 'GROUP' } },
        _count: { _all: true },
      }),
      this.prisma.aiTask.groupBy({
        by: ['employeeId'],
        where: { tenantId, employeeId: { in: employeeIds }, createdAt: { gte: since30 } },
        _sum: { costUsd: true },
      }),
      this.prisma.aiEmployeeApproval.groupBy({
        by: ['employeeId'],
        where: { tenantId, employeeId: { in: employeeIds }, status: 'PENDING' },
        _count: { _all: true },
      }),
      this.prisma.aiTask.groupBy({
        by: ['employeeId'],
        where: { tenantId, employeeId: { in: employeeIds }, completedAt: { not: null } },
        _max: { completedAt: true },
      }),
    ]);
    for (const id of employeeIds) {
      const count = (st: string) => byStatus.find((r) => r.employeeId === id && r.status === st)?._count._all ?? 0;
      const completed = count('COMPLETED');
      const failed = count('FAILED');
      const active = ['QUEUED', 'RUNNING', 'WAITING_APPROVAL', 'BLOCKED', 'PAUSED'].reduce((n, st) => n + count(st), 0);
      out.set(id, {
        tasksCompleted: completed,
        tasksFailed: failed,
        tasksActive: active,
        successRate: completed + failed > 0 ? Math.round((completed / (completed + failed)) * 100) : null,
        pendingApprovals: approvals.find((a) => a.employeeId === id)?._count._all ?? 0,
        costUsd30d: Number(cost.find((c) => c.employeeId === id)?._sum.costUsd ?? 0),
        lastActiveAt: last.find((l) => l.employeeId === id)?._max.completedAt ?? null,
      });
    }
    return out;
  }

  private async withStats<T extends { id: string }>(tenantId: string, rows: T[]): Promise<(T & { stats: EmployeeStats })[]> {
    const stats = await this.computeStats(tenantId, rows.map((r) => r.id));
    return rows.map((r) => ({ ...r, stats: stats.get(r.id)! }));
  }

  async listEmployees(tenantId: string, filters?: { status?: string; department?: string; branchId?: string }) {
    const rows = await this.prisma.aiEmployee.findMany({
      where: {
        tenantId,
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.department ? { department: filters.department } : {}),
        ...(filters?.branchId ? { branchIds: { has: filters.branchId } } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
    return this.withStats(tenantId, rows);
  }

  async getStats(tenantId: string) {
    const [total, active, paused, needsApproval, errors] = await Promise.all([
      this.prisma.aiEmployee.count({ where: { tenantId } }),
      this.prisma.aiEmployee.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.prisma.aiEmployee.count({ where: { tenantId, status: 'PAUSED' } }),
      this.prisma.aiEmployeeApproval.count({ where: { tenantId, status: 'PENDING' } }),
      // Tasks that failed in the last 24 hours.
      this.prisma.aiTask.count({
        where: { tenantId, status: 'FAILED', kind: { not: 'GROUP' }, updatedAt: { gte: new Date(Date.now() - 86400e3) } },
      }),
    ]);

    return { total, active, paused, needsApproval, errors };
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

    const [withStats] = await this.withStats(tenantId, [employee]);
    return withStats!;
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

