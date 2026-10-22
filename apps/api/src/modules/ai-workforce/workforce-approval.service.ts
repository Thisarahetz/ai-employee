import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { OwnerAuthorityService } from '../../common/authz/owner-authority.service';
import { WorkforceToolExecutorService } from './workforce-tool-executor.service';
import { WorkforceTaskService } from './workforce-task.service';
import { evaluateToolPolicy } from './workforce-tools';

interface ToolCallPayload {
  kind: 'tool_call';
  tool: string;
  args: Record<string, unknown>;
}

function isToolCall(p: unknown): p is ToolCallPayload {
  return !!p && typeof p === 'object' && (p as ToolCallPayload).kind === 'tool_call' && typeof (p as ToolCallPayload).tool === 'string';
}

/**
 * Owner decisions on actions AI employees prepared. Approving a command-engine
 * tool call executes it — once — after re-checking the reviewer's authority
 * live and re-evaluating the employee's tool policy (a grant revoked since
 * the request still blocks it). Every decision and execution is audited.
 */
@Injectable()
export class WorkforceApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authority: OwnerAuthorityService,
    private readonly audit: AuditLogService,
    private readonly tools: WorkforceToolExecutorService,
    private readonly tasks: WorkforceTaskService,
  ) {}

  async decide(tenantId: string, userId: string, approvalId: string, decision: 'APPROVED' | 'REJECTED', reviewNotes?: string) {
    if (decision !== 'APPROVED' && decision !== 'REJECTED') throw new BadRequestException('decision must be APPROVED or REJECTED');
    await this.authority.assert(tenantId, userId, 'ai_employees:approve');

    const approval = await this.prisma.aiEmployeeApproval.findFirst({ where: { id: approvalId, tenantId }, include: { employee: true } });
    if (!approval) throw new NotFoundException('Approval request not found');
    if (approval.status !== 'PENDING') throw new ConflictException(`This request was already ${approval.status.toLowerCase()}.`);

    // Atomic claim — a double click or two admins can't execute it twice.
    const claimed = await this.prisma.aiEmployeeApproval.updateMany({
      where: { id: approval.id, tenantId, status: 'PENDING' },
      data: { status: decision, reviewedAt: new Date(), reviewedByUserId: userId, reviewNotes: reviewNotes ?? null },
    });
    if (claimed.count !== 1) throw new ConflictException('This request was already reviewed.');

    await this.audit.record(tenantId, userId, `ai_employee_approval.${decision.toLowerCase()}`, 'AiEmployeeApproval', approval.id, {
      employeeId: approval.employeeId,
      employeeName: approval.employee.name,
      actionType: approval.actionType,
      taskId: approval.taskId,
      reviewNotes,
    });
    await this.prisma.aiEmployeeActivity.create({
      data: {
        tenantId,
        employeeId: approval.employeeId,
        action: `Owner ${decision === 'APPROVED' ? 'approved' : 'rejected'}: ${approval.title}`.slice(0, 250),
        category: 'OPERATIONS',
        details: reviewNotes || `Decision: ${decision}`,
        status: decision === 'APPROVED' ? 'SUCCESS' : 'REJECTED',
      },
    });

    const payload = approval.actionPayload;
    let execution: { executed: boolean; success?: boolean; message: string } = {
      executed: false,
      message: 'No executable action is attached to this request; the decision was recorded.',
    };

    if (isToolCall(payload)) {
      if (decision === 'APPROVED') {
        execution = await this.executeApproved(tenantId, userId, approval.id, approval.employeeId, approval.taskId, payload);
      } else {
        execution = { executed: false, message: 'Rejected — the action was not executed.' };
        if (approval.taskId) {
          await this.tasks.addStep(tenantId, approval.taskId, {
            kind: 'APPROVAL_DECISION',
            toolName: payload.tool,
            input: payload.args,
            status: 'REJECTED',
            message: `Owner rejected ${payload.tool}${reviewNotes ? `: ${reviewNotes}` : ''}.`,
          });
        }
      }
      if (approval.taskId) {
        await this.prisma.aiTaskStep.updateMany({
          where: { taskId: approval.taskId, kind: 'APPROVAL_REQUESTED', status: 'PENDING', output: { path: ['approvalId'], equals: approval.id } },
          data: { status: decision === 'APPROVED' ? 'SUCCESS' : 'REJECTED' },
        });
        await this.finalizeTaskIfSettled(tenantId, approval.taskId);
      }
    }

    const updated = await this.prisma.aiEmployeeApproval.findFirst({ where: { id: approval.id }, include: { employee: true } });
    return { ...updated, execution };
  }

  private async executeApproved(
    tenantId: string,
    userId: string,
    approvalId: string,
    employeeId: string,
    taskId: string | null,
    payload: ToolCallPayload,
  ) {
    const employee = await this.prisma.aiEmployee.findFirst({ where: { id: employeeId, tenantId } });
    const toolset = await this.tools.loadToolset(tenantId);
    const spec = toolset.get(payload.tool);
    const policy = employee ? evaluateToolPolicy(employee, spec, { ownerApproved: true }) : { decision: 'DENY' as const, reason: 'Employee no longer exists.' };

    let success = false;
    let message: string;
    let data: unknown = null;

    if (policy.decision !== 'ALLOW') {
      message = `Approved, but not executed: ${policy.reason}`;
    } else {
      const task = taskId ? await this.prisma.aiTask.findFirst({ where: { id: taskId, tenantId } }) : null;
      const result = await this.tools.execute(
        {
          tenantId,
          employee: { id: employee!.id, name: employee!.name },
          task: task ?? { id: approvalId, threadId: null, createdByUserId: userId, delegatedFromTaskId: null },
        },
        spec!,
        payload.args,
      );
      success = result.success;
      message = result.message;
      data = result.data ?? null;
    }

    await this.prisma.aiEmployeeApproval.update({
      where: { id: approvalId },
      data: { executedAt: new Date(), executionResult: { success, message, data } as Prisma.InputJsonValue },
    });
    if (taskId) {
      await this.tasks.addStep(tenantId, taskId, {
        kind: 'TOOL_CALL',
        toolName: payload.tool,
        input: payload.args,
        output: data,
        status: policy.decision !== 'ALLOW' ? 'BLOCKED' : success ? 'SUCCESS' : 'FAILED',
        message: `[Owner-approved] ${message}`,
      });
    }
    await this.audit.record(tenantId, userId, 'ai_task.tool_executed', 'AiEmployeeApproval', approvalId, {
      taskId,
      employeeId,
      tool: payload.tool,
      args: payload.args,
      approvedBy: userId,
      success,
      message,
    });
    return { executed: policy.decision === 'ALLOW', success, message };
  }

  /** Once no approvals remain pending, a WAITING_APPROVAL task is completed and the owner is told. */
  private async finalizeTaskIfSettled(tenantId: string, taskId: string) {
    const task = await this.prisma.aiTask.findFirst({ where: { id: taskId, tenantId }, include: { employee: { select: { name: true } } } });
    if (!task || task.status !== 'WAITING_APPROVAL') return;
    const stillPending = await this.prisma.aiEmployeeApproval.count({ where: { tenantId, taskId, status: 'PENDING' } });
    if (stillPending > 0) return;

    const decisions = await this.prisma.aiEmployeeApproval.findMany({
      where: { tenantId, taskId },
      select: { title: true, status: true, executionResult: true },
      orderBy: { requestedAt: 'asc' },
    });
    const lines = decisions.map((d) => {
      const r = (d.executionResult ?? {}) as { success?: boolean; message?: string };
      const outcome = d.status === 'REJECTED' ? 'rejected — not executed' : r.success ? `approved and executed — ${r.message}` : `approved, but failed — ${r.message ?? 'no result'}`;
      return `- ${d.title}: ${outcome}`;
    });
    const addendum = `\n\n**Owner decisions**\n${lines.join('\n')}`;

    const done = await this.prisma.aiTask.updateMany({
      where: { id: taskId, status: 'WAITING_APPROVAL' },
      data: { status: 'COMPLETED', progress: 100, completedAt: new Date(), result: `${task.result ?? ''}${addendum}` },
    });
    if (done.count !== 1) return;

    await this.tasks.addStep(tenantId, taskId, { kind: 'RESULT', message: 'All approvals settled — task completed.' });
    if (task.threadId) {
      await this.tasks.postThreadMessage(tenantId, task.threadId, {
        role: 'AI',
        employeeId: task.employeeId,
        content: `**${task.employee?.name ?? 'AI employee'}** — approvals settled for **${task.title}**.${addendum}`,
        metadata: { taskIds: [taskId], kind: 'approval_outcome' },
        focusTaskIds: [taskId],
      });
    }
    if (task.parentTaskId) await this.tasks.refreshGroup(tenantId, task.parentTaskId);
  }
}
