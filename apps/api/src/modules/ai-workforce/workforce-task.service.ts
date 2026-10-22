import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { TASK_QUEUED_EVENT } from './workforce-tool-executor.service';

export const TERMINAL_STATUSES = ['COMPLETED', 'FAILED', 'CANCELLED'];
export const ACTIVE_STATUSES = ['QUEUED', 'RUNNING', 'WAITING_APPROVAL', 'PAUSED', 'BLOCKED'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export interface CreateTasksInput {
  employeeIds: string[];
  title: string;
  description?: string;
  goal?: string | null;
  priority?: string;
  deadline?: Date | string | null;
  threadId?: string | null;
  contextTaskIds?: string[];
  kind?: 'TASK' | 'REVIEW';
  reviewOfTaskId?: string | null;
  confidential?: boolean;
}

export type TaskControlAction = 'PAUSE' | 'RESUME' | 'CANCEL' | 'PRIORITIZE' | 'REASSIGN';

export interface TaskListFilter {
  status?: string;
  employeeId?: string;
  q?: string;
  limit?: number;
  includeGroups?: boolean;
}

/**
 * Task lifecycle for the AI workforce: creation (single or a group across
 * several employees), owner control, the execution step log, group status
 * roll-up and posting outcomes back into the owner's command thread.
 */
@Injectable()
export class WorkforceTaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly emitter: EventEmitter2,
  ) {}

  // ── Creation ────────────────────────────────────────────────────────────

  async createTasks(tenantId: string, userId: string, input: CreateTasksInput) {
    const title = input.title?.trim();
    if (!title) throw new BadRequestException('A task title is required.');
    const employeeIds = [...new Set(input.employeeIds ?? [])];
    if (!employeeIds.length) throw new BadRequestException('Choose at least one AI employee.');

    const employees = await this.prisma.aiEmployee.findMany({
      where: { tenantId, id: { in: employeeIds } },
      select: { id: true, name: true, status: true },
    });
    if (employees.length !== employeeIds.length) throw new NotFoundException('One or more AI employees were not found.');

    const priority = PRIORITIES.includes(String(input.priority).toUpperCase()) ? String(input.priority).toUpperCase() : 'MEDIUM';
    const deadline = input.deadline ? new Date(input.deadline) : null;
    if (deadline && Number.isNaN(deadline.getTime())) throw new BadRequestException('Invalid deadline.');

    const contextTaskIds = await this.validTaskIds(tenantId, input.contextTaskIds ?? []);
    const reviewOfTaskId = input.reviewOfTaskId ? (await this.validTaskIds(tenantId, [input.reviewOfTaskId]))[0] ?? null : null;

    const common = {
      tenantId,
      title: title.slice(0, 200),
      description: (input.description ?? '').slice(0, 8000),
      goal: input.goal?.slice(0, 2000) || null,
      priority,
      deadline,
      threadId: input.threadId ?? null,
      contextTaskIds,
      kind: input.kind ?? 'TASK',
      reviewOfTaskId,
      confidential: Boolean(input.confidential),
      createdByUserId: userId,
    };

    let parent: { id: string } | null = null;
    if (employees.length > 1) {
      parent = await this.prisma.aiTask.create({
        data: { ...common, kind: 'GROUP', status: 'RUNNING', startedAt: new Date() },
      });
    }

    const created = [];
    for (const emp of employees) {
      const blocked = emp.status !== 'ACTIVE';
      const task = await this.prisma.aiTask.create({
        data: {
          ...common,
          employeeId: emp.id,
          parentTaskId: parent?.id ?? null,
          status: blocked ? 'BLOCKED' : 'QUEUED',
          error: blocked ? `${emp.name} is paused. Resume the employee, then resume this task.` : null,
        },
      });
      created.push(task);
      await this.auditLogService.record(tenantId, userId, 'ai_task.created', 'AiTask', task.id, {
        title: task.title,
        employeeId: emp.id,
        priority,
        deadline,
        kind: task.kind,
        parentTaskId: parent?.id ?? null,
      });
      if (!blocked) this.enqueue(tenantId, task.id);
    }

    return { parent, tasks: created };
  }

  enqueue(tenantId: string, taskId: string) {
    this.emitter.emit(TASK_QUEUED_EVENT, { taskId, tenantId });
  }

  private async validTaskIds(tenantId: string, ids: string[]): Promise<string[]> {
    if (!ids.length) return [];
    const rows = await this.prisma.aiTask.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  // ── Queries ─────────────────────────────────────────────────────────────

  list(tenantId: string, filter: TaskListFilter = {}) {
    const q = filter.q?.trim();
    return this.prisma.aiTask.findMany({
      where: {
        tenantId,
        ...(filter.includeGroups ? {} : { parentTaskId: null }),
        ...(filter.status ? { status: { in: filter.status.split(',') } } : {}),
        ...(filter.employeeId ? { employeeId: filter.employeeId } : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
                { result: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        employee: { select: { id: true, name: true, role: true, department: true, avatar: true } },
        children: {
          select: { id: true, status: true, progress: true, employee: { select: { id: true, name: true } } },
        },
        _count: { select: { approvals: { where: { status: 'PENDING' } } } },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: Math.min(filter.limit ?? 50, 200),
    });
  }

  async get(tenantId: string, id: string) {
    const task = await this.prisma.aiTask.findFirst({
      where: { id, tenantId },
      include: {
        employee: { select: { id: true, name: true, role: true, department: true, avatar: true, status: true } },
        steps: { orderBy: { seq: 'asc' } },
        approvals: { orderBy: { requestedAt: 'desc' } },
        children: {
          include: { employee: { select: { id: true, name: true, role: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  // ── Owner control ───────────────────────────────────────────────────────

  async control(
    tenantId: string,
    userId: string,
    id: string,
    action: TaskControlAction,
    extra: { employeeId?: string; note?: string } = {},
  ) {
    const task = await this.prisma.aiTask.findFirst({ where: { id, tenantId } });
    if (!task) throw new NotFoundException('Task not found');

    if (task.kind === 'GROUP') {
      if (!['PAUSE', 'RESUME', 'CANCEL', 'PRIORITIZE'].includes(action)) {
        throw new BadRequestException('Reassign individual tasks inside a group, not the group itself.');
      }
      const children = await this.prisma.aiTask.findMany({ where: { tenantId, parentTaskId: task.id } });
      for (const child of children) {
        try {
          await this.control(tenantId, userId, child.id, action, extra);
        } catch {
          // Children already finished (or not in a controllable state) are skipped.
        }
      }
      await this.refreshGroup(tenantId, task.id);
      return this.get(tenantId, task.id);
    }

    const terminal = TERMINAL_STATUSES.includes(task.status);
    let data: Prisma.AiTaskUpdateInput = {};
    let note = '';

    switch (action) {
      case 'PAUSE':
        if (!['QUEUED', 'RUNNING', 'BLOCKED'].includes(task.status)) {
          throw new ConflictException(`A ${task.status.toLowerCase()} task cannot be paused.`);
        }
        data = { status: 'PAUSED' };
        note = 'Paused by owner.';
        break;
      case 'RESUME':
        if (!['PAUSED', 'BLOCKED', 'FAILED'].includes(task.status)) {
          throw new ConflictException(`A ${task.status.toLowerCase()} task cannot be resumed.`);
        }
        data = { status: 'QUEUED', error: null, completedAt: null };
        note = task.status === 'FAILED' ? 'Retried by owner.' : 'Resumed by owner.';
        break;
      case 'CANCEL':
        if (terminal) throw new ConflictException(`Task is already ${task.status.toLowerCase()}.`);
        data = { status: 'CANCELLED', completedAt: new Date() };
        note = 'Cancelled by owner.';
        // Pending approvals for a cancelled task must not stay actionable.
        await this.prisma.aiEmployeeApproval.updateMany({
          where: { tenantId, taskId: task.id, status: 'PENDING' },
          data: { status: 'REJECTED', reviewedAt: new Date(), reviewedByUserId: userId, reviewNotes: 'Task cancelled by owner' },
        });
        break;
      case 'PRIORITIZE':
        if (terminal) throw new ConflictException(`Task is already ${task.status.toLowerCase()}.`);
        data = { priority: 'URGENT', ...(task.status === 'PAUSED' ? { status: 'QUEUED' } : {}) };
        note = 'Marked URGENT by owner.';
        break;
      case 'REASSIGN': {
        if (terminal) throw new ConflictException(`Task is already ${task.status.toLowerCase()}.`);
        if (!extra.employeeId) throw new BadRequestException('employeeId is required to reassign.');
        if (extra.employeeId === task.employeeId) throw new BadRequestException('Task is already assigned to that employee.');
        const target = await this.prisma.aiEmployee.findFirst({ where: { id: extra.employeeId, tenantId } });
        if (!target) throw new NotFoundException('Target AI employee not found');
        const blocked = target.status !== 'ACTIVE';
        // A RUNNING executor notices the status change and stops before its next step.
        data = {
          employee: { connect: { id: target.id } },
          status: blocked ? 'BLOCKED' : 'QUEUED',
          progress: 0,
          error: blocked ? `${target.name} is paused.` : null,
        };
        note = `Reassigned to ${target.name} by owner.`;
        break;
      }
      default:
        throw new BadRequestException(`Unknown action ${action}`);
    }

    const updated = await this.prisma.aiTask.update({ where: { id: task.id }, data });
    await this.addStep(tenantId, task.id, { kind: 'CONTROL', message: extra.note ? `${note} ${extra.note}` : note });
    await this.auditLogService.record(tenantId, userId, `ai_task.${action.toLowerCase()}`, 'AiTask', task.id, {
      from: { status: task.status, priority: task.priority, employeeId: task.employeeId },
      to: { status: updated.status, priority: updated.priority, employeeId: updated.employeeId },
    });

    if (updated.status === 'QUEUED') this.enqueue(tenantId, task.id);
    if (task.parentTaskId) await this.refreshGroup(tenantId, task.parentTaskId);
    return updated;
  }

  async updateDetails(
    tenantId: string,
    userId: string,
    id: string,
    patch: { priority?: string; deadline?: string | null; title?: string; description?: string; goal?: string | null },
  ) {
    const task = await this.prisma.aiTask.findFirst({ where: { id, tenantId } });
    if (!task) throw new NotFoundException('Task not found');
    const data: Prisma.AiTaskUpdateInput = {};
    if (patch.priority !== undefined) {
      const p = patch.priority.toUpperCase();
      if (!PRIORITIES.includes(p)) throw new BadRequestException('Invalid priority');
      data.priority = p;
    }
    if (patch.deadline !== undefined) {
      const d = patch.deadline ? new Date(patch.deadline) : null;
      if (d && Number.isNaN(d.getTime())) throw new BadRequestException('Invalid deadline');
      data.deadline = d;
    }
    if (patch.title !== undefined && patch.title.trim()) data.title = patch.title.trim().slice(0, 200);
    if (patch.description !== undefined) data.description = patch.description.slice(0, 8000);
    if (patch.goal !== undefined) data.goal = patch.goal?.slice(0, 2000) || null;

    const updated = await this.prisma.aiTask.update({ where: { id: task.id }, data });
    await this.auditLogService.record(tenantId, userId, 'ai_task.updated', 'AiTask', task.id, { changes: patch });
    return updated;
  }

  // ── Execution log ───────────────────────────────────────────────────────

  async addStep(
    tenantId: string,
    taskId: string,
    step: { kind: string; message?: string; toolName?: string; input?: unknown; output?: unknown; status?: string },
  ) {
    const last = await this.prisma.aiTaskStep.findFirst({
      where: { taskId },
      orderBy: { seq: 'desc' },
      select: { seq: true },
    });
    return this.prisma.aiTaskStep.create({
      data: {
        tenantId,
        taskId,
        seq: (last?.seq ?? 0) + 1,
        kind: step.kind,
        toolName: step.toolName ?? null,
        input: step.input === undefined ? Prisma.JsonNull : (step.input as Prisma.InputJsonValue),
        output: step.output === undefined ? Prisma.JsonNull : (truncateJson(step.output) as Prisma.InputJsonValue),
        status: step.status ?? 'SUCCESS',
        message: (step.message ?? '').slice(0, 4000),
      },
    });
  }

  // ── Groups & threads ────────────────────────────────────────────────────

  async refreshGroup(tenantId: string, parentId: string) {
    const parent = await this.prisma.aiTask.findFirst({ where: { id: parentId, tenantId } });
    if (!parent || parent.kind !== 'GROUP') return;
    const children = await this.prisma.aiTask.findMany({
      where: { tenantId, parentTaskId: parentId },
      include: { employee: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    if (!children.length) return;

    const statuses = children.map((c) => c.status);
    const progress = Math.round(children.reduce((s, c) => s + (TERMINAL_STATUSES.includes(c.status) ? 100 : c.progress), 0) / children.length);
    let status = 'RUNNING';
    if (statuses.every((s) => TERMINAL_STATUSES.includes(s))) {
      status = statuses.every((s) => s === 'CANCELLED') ? 'CANCELLED' : statuses.every((s) => s !== 'COMPLETED') ? 'FAILED' : 'COMPLETED';
    } else if (statuses.some((s) => s === 'WAITING_APPROVAL') && !statuses.some((s) => s === 'RUNNING' || s === 'QUEUED')) {
      status = 'WAITING_APPROVAL';
    } else if (statuses.every((s) => s === 'PAUSED' || TERMINAL_STATUSES.includes(s))) {
      status = 'PAUSED';
    }

    const finished = TERMINAL_STATUSES.includes(status);
    const result = finished
      ? children.map((c) => `### ${c.employee?.name ?? 'Unassigned'} — ${c.status}\n${(c.result ?? c.error ?? '').slice(0, 2500)}`).join('\n\n')
      : parent.result;

    const wasFinished = TERMINAL_STATUSES.includes(parent.status);
    await this.prisma.aiTask.update({
      where: { id: parentId },
      data: { status, progress: finished ? 100 : progress, result, completedAt: finished ? new Date() : null },
    });
    if (finished && !wasFinished && parent.threadId) {
      await this.postThreadMessage(tenantId, parent.threadId, {
        role: 'AI',
        content: `**Team task finished: ${parent.title}** (${status.toLowerCase()})\n\n${result}`,
        metadata: { taskIds: [parent.id, ...children.map((c) => c.id)], kind: 'group_report' },
        focusTaskIds: [parent.id],
      });
    }
  }

  async postThreadMessage(
    tenantId: string,
    threadId: string,
    msg: { role: 'AI' | 'SYSTEM'; content: string; employeeId?: string | null; metadata?: Record<string, unknown>; focusTaskIds?: string[] },
  ) {
    const thread = await this.prisma.ownerCommandThread.findFirst({ where: { id: threadId, tenantId } });
    if (!thread) return null;
    const message = await this.prisma.ownerCommandMessage.create({
      data: {
        tenantId,
        threadId,
        role: msg.role,
        employeeId: msg.employeeId ?? null,
        content: msg.content.slice(0, 20000),
        metadata: (msg.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
    const focus = (thread.focus ?? {}) as { taskIds?: string[]; employeeIds?: string[] };
    await this.prisma.ownerCommandThread.update({
      where: { id: threadId },
      data: {
        focus: {
          taskIds: msg.focusTaskIds?.length ? msg.focusTaskIds : focus.taskIds ?? [],
          employeeIds: msg.employeeId ? [msg.employeeId] : focus.employeeIds ?? [],
        },
      },
    });
    return message;
  }
}

function truncateJson(value: unknown, max = 12000): unknown {
  try {
    const s = JSON.stringify(value);
    if (s === undefined) return null;
    return s.length <= max ? value : { truncated: true, preview: s.slice(0, max) };
  } catch {
    return { unserializable: true };
  }
}
