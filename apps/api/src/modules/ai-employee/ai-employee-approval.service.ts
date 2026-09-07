import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { AuditLogService } from '../audit-log/audit-log.service';

export interface CreateApprovalDto {
  employeeId: string;
  title: string;
  description: string;
  actionType: string;
  actionPayload?: Record<string, any>;
}

@Injectable()
export class AiEmployeeApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async listApprovals(tenantId: string, status?: string) {
    return this.prisma.aiEmployeeApproval.findMany({
      where: {
        tenantId,
        ...(status ? { status } : {}),
      },
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            role: true,
            department: true,
            avatar: true,
          },
        },
      },
      orderBy: { requestedAt: 'desc' },
    });
  }

  async createApproval(tenantId: string, dto: CreateApprovalDto) {
    const approval = await this.prisma.aiEmployeeApproval.create({
      data: {
        tenantId,
        employeeId: dto.employeeId,
        title: dto.title,
        description: dto.description,
        actionType: dto.actionType,
        actionPayload: dto.actionPayload ?? {},
        status: 'PENDING',
      },
      include: {
        employee: true,
      },
    });

    // Notify active owners and admins of the pending approval
    const owners = await this.prisma.tenantMembership.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        role: { in: ['OWNER', 'ADMIN'] },
      },
      select: { userId: true },
    });

    if (owners.length > 0) {
      await this.prisma.notification.createMany({
        data: owners.map((member) => ({
          tenantId,
          userId: member.userId,
          type: 'ai_employee.approval_requested',
          title: `Action approval required: ${approval.employee.name}`,
          body: approval.title,
          metadata: {
            approvalId: approval.id,
            employeeId: approval.employeeId,
            actionType: approval.actionType,
          },
        })),
      });
    }

    // Also record an activity entry on the employee
    await this.prisma.aiEmployeeActivity.create({
      data: {
        tenantId,
        employeeId: dto.employeeId,
        action: dto.title,
        category: 'OPERATIONS',
        details: dto.description,
        status: 'PENDING_APPROVAL',
      },
    });

    return approval;
  }

  async reviewApproval(
    tenantId: string,
    id: string,
    userId: string,
    decision: 'APPROVED' | 'REJECTED',
    reviewNotes?: string,
  ) {
    const approval = await this.prisma.aiEmployeeApproval.findFirst({
      where: { id, tenantId },
      include: { employee: true },
    });

    if (!approval) {
      throw new NotFoundException('Approval request not found');
    }

    const updated = await this.prisma.aiEmployeeApproval.update({
      where: { id: approval.id },
      data: {
        status: decision,
        reviewedAt: new Date(),
        reviewedByUserId: userId,
        reviewNotes: reviewNotes ?? null,
      },
      include: { employee: true },
    });

    // Record in audit log
    await this.auditLogService.record(
      tenantId,
      userId,
      `ai_employee_approval.${decision.toLowerCase()}`,
      'AiEmployeeApproval',
      approval.id,
      {
        employeeName: approval.employee.name,
        actionType: approval.actionType,
        decision,
        reviewNotes,
      },
    );

    // Record corresponding employee activity
    await this.prisma.aiEmployeeActivity.create({
      data: {
        tenantId,
        employeeId: approval.employeeId,
        action: `Owner ${decision === 'APPROVED' ? 'approved' : 'rejected'}: ${approval.title}`,
        category: 'OPERATIONS',
        details: reviewNotes || `Decision: ${decision}`,
        status: decision === 'APPROVED' ? 'SUCCESS' : 'REJECTED',
      },
    });

    return updated;
  }
}
