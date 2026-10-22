import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OwnerAuthorityService } from '../../common/authz/owner-authority.service';
import { ControlOp, ParsedCommand, parseCommand } from './command-interpreter';
import { ACTIVE_STATUSES, WorkforceTaskService } from './workforce-task.service';
import { WorkforceToolExecutorService } from './workforce-tool-executor.service';

const MAX_MESSAGE_LENGTH = 4000;

interface Reply {
  content: string;
  taskIds: string[];
  employeeIds: string[];
  limitations: string[];
}

const pct = (n: number) => `${Math.max(0, Math.min(100, Math.round(n)))}%`;
const statusLabel = (s: string) => s.toLowerCase().replace(/_/g, ' ');

function validTimeZone(tz: string | null | undefined): string {
  if (tz) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return tz;
    } catch {
      // Fall through to the server zone.
    }
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** e.g. "Fri, 23 Oct, 23:59" in the business's time zone. */
function formatWhen(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
}

/**
 * The owner's chat with the AI workforce. Each owner message is interpreted
 * deterministically (see command-interpreter.ts) and turned into a real
 * action — creating tasks, controlling them, or answering status questions
 * from the database. Replies only describe things that actually happened;
 * task results are posted into the thread later by the executor.
 */
@Injectable()
export class WorkforceCommandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authority: OwnerAuthorityService,
    private readonly tasks: WorkforceTaskService,
    private readonly tools: WorkforceToolExecutorService,
  ) {}

  // ── Threads ─────────────────────────────────────────────────────────────

  listThreads(tenantId: string, userId: string) {
    return this.prisma.ownerCommandThread.findMany({
      where: { tenantId, userId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { content: true, role: true, createdAt: true } } },
    });
  }

  async getThread(tenantId: string, userId: string, threadId: string) {
    const thread = await this.prisma.ownerCommandThread.findFirst({
      where: { id: threadId, tenantId, userId },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 500 } },
    });
    if (!thread) throw new NotFoundException('Conversation not found');
    return thread;
  }

  createThread(tenantId: string, userId: string, title?: string) {
    return this.prisma.ownerCommandThread.create({
      data: { tenantId, userId, title: title?.trim().slice(0, 120) || 'New conversation' },
    });
  }

  async deleteThread(tenantId: string, userId: string, threadId: string) {
    const res = await this.prisma.ownerCommandThread.deleteMany({ where: { id: threadId, tenantId, userId } });
    if (!res.count) throw new NotFoundException('Conversation not found');
    return { deleted: true };
  }

  // ── Commands ────────────────────────────────────────────────────────────

  async sendCommand(tenantId: string, userId: string, input: { text: string; threadId?: string | null }) {
    const text = (input.text ?? '').trim();
    if (!text) throw new BadRequestException('Message is empty.');
    if (text.length > MAX_MESSAGE_LENGTH) throw new BadRequestException(`Message is too long (max ${MAX_MESSAGE_LENGTH} characters).`);
    await this.authority.assert(tenantId, userId, 'ai_employees:command');

    let thread = input.threadId
      ? await this.prisma.ownerCommandThread.findFirst({ where: { id: input.threadId, tenantId, userId } })
      : null;
    if (input.threadId && !thread) throw new NotFoundException('Conversation not found');
    const isNew = !thread || thread.title === 'New conversation';
    if (!thread) thread = await this.createThread(tenantId, userId);

    const ownerMessage = await this.prisma.ownerCommandMessage.create({
      data: { tenantId, threadId: thread.id, role: 'OWNER', userId, content: text },
    });

    const [employees, recentTasks, business] = await Promise.all([
      this.prisma.aiEmployee.findMany({
        where: { tenantId },
        select: { id: true, name: true, role: true, department: true, description: true, responsibilities: true, status: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.aiTask.findMany({
        where: { tenantId, kind: { not: 'GROUP' } },
        select: { id: true, title: true, status: true, employeeId: true, priority: true, startedAt: true, completedAt: true, createdAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 60,
      }),
      this.prisma.business.findFirst({ where: { tenantId }, select: { timezone: true }, orderBy: { createdAt: 'asc' } }),
    ]);
    const timeZone = validTimeZone(business?.timezone);

    const focus = (thread.focus ?? {}) as { taskIds?: string[]; employeeIds?: string[] };
    const parsed = parseCommand(text, { employees, tasks: recentTasks, focus, timeZone });

    let reply: Reply;
    if (!employees.length) {
      reply = {
        content: 'You have no AI employees yet. Hire one from the AI Employees page, then send this again.',
        taskIds: [],
        employeeIds: [],
        limitations: ['no_employees'],
      };
    } else {
      reply = await this.handle(tenantId, userId, thread.id, parsed, employees, timeZone);
    }

    const aiMessage = await this.prisma.ownerCommandMessage.create({
      data: {
        tenantId,
        threadId: thread.id,
        role: 'AI',
        content: reply.content,
        metadata: {
          intent: parsed.intent,
          taskIds: reply.taskIds,
          employeeIds: reply.employeeIds,
          limitations: reply.limitations,
        } as Prisma.InputJsonValue,
      },
    });

    await this.prisma.ownerCommandThread.update({
      where: { id: thread.id },
      data: {
        ...(isNew ? { title: parsed.title.slice(0, 120) || 'New conversation' } : {}),
        focus: {
          taskIds: reply.taskIds.length ? reply.taskIds : focus.taskIds ?? [],
          employeeIds: reply.employeeIds.length ? reply.employeeIds : focus.employeeIds ?? [],
        },
      },
    });

    return { threadId: thread.id, intent: parsed.intent, messages: [ownerMessage, aiMessage] };
  }

  private async handle(
    tenantId: string,
    userId: string,
    threadId: string,
    cmd: ParsedCommand,
    employees: { id: string; name: string; status: string }[],
    timeZone: string,
  ): Promise<Reply> {
    const nameOf = (id: string | null | undefined) => employees.find((e) => e.id === id)?.name ?? 'Unassigned';

    switch (cmd.intent) {
      case 'STATUS_QUERY':
        return this.statusReply(tenantId, cmd.employeeIds, nameOf, timeZone);
      case 'TEAM_STATUS':
        return this.teamStatusReply(tenantId, employees);
      case 'DAILY_SUMMARY':
        return this.summaryReply(tenantId, cmd.period ?? 'today', nameOf);
      case 'TASK_FOLLOWUP':
        return this.followupReply(tenantId, cmd.referencedTaskIds[0], nameOf);
      case 'CONTROL':
        return this.controlReply(tenantId, userId, cmd.controls, nameOf);
      case 'REVIEW':
      case 'MEETING':
      case 'NEW_TASK':
        return this.createWork(tenantId, userId, threadId, cmd, nameOf, timeZone);
    }
  }

  private async createWork(
    tenantId: string,
    userId: string,
    threadId: string,
    cmd: ParsedCommand,
    nameOf: (id: string | null | undefined) => string,
    timeZone: string,
  ): Promise<Reply> {
    const limitations: string[] = [];
    if (!cmd.employeeIds.length) {
      return {
        content: cmd.routingNote ?? 'No active AI employee can take this request. Resume or hire an employee first.',
        taskIds: [],
        employeeIds: [],
        limitations: ['no_assignee'],
      };
    }

    const notes: string[] = [];
    if (cmd.routingNote) notes.push(cmd.routingNote);
    if (cmd.intent === 'MEETING') {
      const toolset = await this.tools.loadToolset(tenantId);
      const hasCalendar = [...toolset.values()].some((t) => t.source === 'integration' && /calendar|meeting|event|availability/i.test(t.name));
      if (!hasCalendar) {
        limitations.push('no_calendar');
        notes.push(
          'No calendar integration is connected, so nobody can actually book the meeting. The employee will prepare an agenda and proposed times for you to send.',
        );
      }
    }

    const { parent, tasks } = await this.tasks.createTasks(tenantId, userId, {
      employeeIds: cmd.employeeIds,
      title: cmd.intent === 'REVIEW' ? `Review: ${cmd.title}` : cmd.title,
      description: cmd.description,
      priority: cmd.priority,
      deadline: cmd.deadline,
      threadId,
      contextTaskIds: cmd.referencedTaskIds,
      kind: cmd.intent === 'REVIEW' ? 'REVIEW' : 'TASK',
      reviewOfTaskId: cmd.reviewTargetTaskId ?? null,
    });

    const lines = tasks.map((t) =>
      t.status === 'BLOCKED' ? `- **${nameOf(t.employeeId)}** — blocked: ${t.error}` : `- **${nameOf(t.employeeId)}** — queued`,
    );
    const meta = [
      cmd.priority !== 'MEDIUM' ? `Priority: ${cmd.priority}` : '',
      cmd.deadline ? `Deadline: ${formatWhen(cmd.deadline, timeZone)}` : '',
    ].filter(Boolean);
    const verb = cmd.intent === 'REVIEW' ? 'Review assigned' : tasks.length > 1 ? 'Assigned to the team' : 'Task assigned';
    const anyQueued = tasks.some((t) => t.status !== 'BLOCKED');
    const closing = anyQueued
      ? 'I’ll post the report here when it’s done. Anything that needs your approval will show up in Approvals.'
      : 'Nothing will start until you resume the employee. Then say “resume it” here.';

    return {
      content: [
        `${verb}: **${cmd.title}**`,
        lines.join('\n'),
        meta.join(' · '),
        notes.join('\n'),
        closing,
      ]
        .filter(Boolean)
        .join('\n\n'),
      taskIds: parent ? [parent.id, ...tasks.map((t) => t.id)] : tasks.map((t) => t.id),
      employeeIds: tasks.map((t) => t.employeeId!).filter(Boolean),
      limitations,
    };
  }

  private async controlReply(
    tenantId: string,
    userId: string,
    ops: ControlOp[],
    nameOf: (id: string | null | undefined) => string,
  ): Promise<Reply> {
    const lines: string[] = [];
    const taskIds: string[] = [];
    const verbs: Record<string, string> = { PAUSE: 'Paused', RESUME: 'Resumed', CANCEL: 'Cancelled', PRIORITIZE: 'Marked urgent', REASSIGN: 'Reassigned' };

    for (const op of ops) {
      if (!op.taskIds.length) {
        const done = op.finishedTaskId
          ? await this.prisma.aiTask.findFirst({ where: { id: op.finishedTaskId, tenantId }, select: { id: true, title: true, status: true } })
          : null;
        if (done) {
          taskIds.push(done.id);
          lines.push(
            done.status === 'FAILED' && op.action !== 'RESUME'
              ? `- **${done.title}** already failed, so there’s nothing to ${op.action.toLowerCase()}. Say “retry it” to run it again.`
              : `- **${done.title}** is already ${statusLabel(done.status)} — nothing to ${op.action.toLowerCase()}.`,
          );
        } else {
          lines.push(`- Couldn’t find a task matching “${op.reference || 'that'}” to ${op.action.toLowerCase()}.`);
        }
        continue;
      }
      if (op.action === 'REASSIGN' && !op.employeeId) {
        lines.push(`- Who should take over “${op.reference}”? Say e.g. “reassign it to Sales”.`);
        continue;
      }
      for (const id of op.taskIds) {
        const before = await this.prisma.aiTask.findFirst({ where: { id, tenantId }, select: { title: true, status: true } });
        try {
          const t = await this.tasks.control(tenantId, userId, id, op.action, { employeeId: op.employeeId });
          taskIds.push(t.id);
          const verb = op.action === 'RESUME' && before?.status === 'FAILED' ? 'Retried' : verbs[op.action];
          lines.push(
            `- ${verb}: **${t.title}**${op.action === 'REASSIGN' ? ` → ${nameOf(t.employeeId)}` : ''} (now ${statusLabel(t.status)})`,
          );
        } catch (err) {
          lines.push(`- Couldn’t ${op.action.toLowerCase()} **${before?.title ?? 'that task'}**: ${(err as Error).message}`);
        }
      }
    }
    return { content: lines.join('\n') || 'Nothing to change.', taskIds, employeeIds: [], limitations: [] };
  }

  private async statusReply(
    tenantId: string,
    employeeIds: string[],
    nameOf: (id: string | null | undefined) => string,
    timeZone: string,
  ): Promise<Reply> {
    const tasks = await this.prisma.aiTask.findMany({
      where: {
        tenantId,
        kind: { not: 'GROUP' },
        status: { in: ACTIVE_STATUSES },
        ...(employeeIds.length ? { employeeId: { in: employeeIds } } : {}),
      },
      select: { id: true, title: true, status: true, progress: true, priority: true, employeeId: true, deadline: true },
      orderBy: [{ updatedAt: 'desc' }],
      take: 30,
    });
    const who = employeeIds.length ? employeeIds.map(nameOf).join(', ') : 'The team';
    if (!tasks.length) return { content: `${who} ${employeeIds.length > 1 ? 'have' : 'has'} no open tasks right now.`, taskIds: [], employeeIds, limitations: [] };

    const lines = tasks.map(
      (t) =>
        `- **${t.title}** — ${nameOf(t.employeeId)} · ${statusLabel(t.status)} · ${pct(t.progress)}${t.priority !== 'MEDIUM' ? ` · ${t.priority}` : ''}${
          t.deadline ? ` · due ${formatWhen(t.deadline, timeZone)}` : ''
        }`,
    );
    return { content: `${who} ${employeeIds.length > 1 ? 'have' : 'has'} ${tasks.length} open task${tasks.length === 1 ? '' : 's'}:\n\n${lines.join('\n')}`, taskIds: tasks.slice(0, 5).map((t) => t.id), employeeIds, limitations: [] };
  }

  private async teamStatusReply(tenantId: string, employees: { id: string; name: string; status: string }[]): Promise<Reply> {
    const [grouped, pendingApprovals] = await Promise.all([
      this.prisma.aiTask.groupBy({
        by: ['employeeId', 'status'],
        where: { tenantId, kind: { not: 'GROUP' }, status: { in: ACTIVE_STATUSES } },
        _count: { _all: true },
      }),
      this.prisma.aiEmployeeApproval.count({ where: { tenantId, status: 'PENDING' } }),
    ]);
    const lines = employees.map((e) => {
      const mine = grouped.filter((g) => g.employeeId === e.id);
      const parts = mine.map((g) => `${g._count._all} ${statusLabel(g.status)}`);
      const state = e.status === 'ACTIVE' ? '' : ' _(paused)_';
      return `- **${e.name}**${state}: ${parts.length ? parts.join(', ') : 'idle'}`;
    });
    return {
      content: `**Team status**\n\n${lines.join('\n')}\n\nPending approvals: ${pendingApprovals}`,
      taskIds: [],
      employeeIds: [],
      limitations: [],
    };
  }

  private async summaryReply(tenantId: string, period: 'today' | 'week', nameOf: (id: string | null | undefined) => string): Promise<Reply> {
    const since = new Date();
    if (period === 'week') since.setDate(since.getDate() - 7);
    else since.setHours(0, 0, 0, 0);

    const [completed, failed, waiting, pendingApprovals] = await Promise.all([
      this.prisma.aiTask.findMany({
        where: { tenantId, kind: { not: 'GROUP' }, status: 'COMPLETED', completedAt: { gte: since } },
        select: { id: true, title: true, employeeId: true },
        orderBy: { completedAt: 'desc' },
        take: 40,
      }),
      this.prisma.aiTask.findMany({
        where: { tenantId, kind: { not: 'GROUP' }, status: 'FAILED', updatedAt: { gte: since } },
        select: { id: true, title: true, employeeId: true, error: true },
        take: 20,
      }),
      this.prisma.aiTask.count({ where: { tenantId, kind: { not: 'GROUP' }, status: { in: ACTIVE_STATUSES } } }),
      this.prisma.aiEmployeeApproval.count({ where: { tenantId, status: 'PENDING' } }),
    ]);

    const label = period === 'week' ? 'the last 7 days' : 'today';
    const parts = [
      `**Summary for ${label}**`,
      completed.length
        ? `**Completed (${completed.length})**\n${completed.map((t) => `- ${t.title} — ${nameOf(t.employeeId)}`).join('\n')}`
        : 'No tasks were completed.',
      failed.length ? `**Failed (${failed.length})**\n${failed.map((t) => `- ${t.title} — ${nameOf(t.employeeId)}: ${(t.error ?? '').slice(0, 140)}`).join('\n')}` : '',
      `Still open: ${waiting} · Pending approvals: ${pendingApprovals}`,
    ].filter(Boolean);
    return { content: parts.join('\n\n'), taskIds: completed.slice(0, 5).map((t) => t.id), employeeIds: [], limitations: [] };
  }

  private async followupReply(tenantId: string, taskId: string | undefined, nameOf: (id: string | null | undefined) => string): Promise<Reply> {
    const task = taskId ? await this.prisma.aiTask.findFirst({ where: { id: taskId, tenantId } }) : null;
    if (!task) return { content: 'I’m not sure which task you mean — can you name it?', taskIds: [], employeeIds: [], limitations: [] };

    const pending = await this.prisma.aiEmployeeApproval.count({ where: { tenantId, taskId: task.id, status: 'PENDING' } });
    const head = `**${task.title}** — ${nameOf(task.employeeId)} · ${statusLabel(task.status)} · ${pct(task.progress)}`;
    let body: string;
    if (task.result) body = task.result.slice(0, 6000);
    else if (task.error) body = `Problem: ${task.error}`;
    else body = 'No results yet — it’s still being worked on.';
    const extra = pending ? `\n\n${pending} action(s) are waiting for your approval.` : '';
    return { content: `${head}\n\n${body}${extra}`, taskIds: [task.id], employeeIds: task.employeeId ? [task.employeeId] : [], limitations: [] };
  }
}
