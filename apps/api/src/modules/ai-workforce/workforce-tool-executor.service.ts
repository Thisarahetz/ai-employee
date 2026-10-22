import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RagService } from '../rag/rag.service';
import { NotificationService } from '../notification/notification.service';
import { ExternalActionService } from '../external-action/external-action.service';
import { toJsonSchema } from '../ai-tools/ai-tools.service';
import { matchEmployees } from './command-interpreter';
import { fetchPublicPage } from './safe-web-fetch';
import { INTERNAL_TOOLS, WorkforceToolSpec, buildIntegrationTool } from './workforce-tools';
import { WorkforceTaskService } from './workforce-task.service';

export const MAX_DELEGATION_DEPTH = 2;
/** Hand-offs a single task may create — stops one task fanning out without bound. */
export const MAX_DELEGATIONS_PER_TASK = 3;

export interface ToolResult {
  success: boolean;
  message: string;
  data?: unknown;
}

export interface ToolExecutionContext {
  tenantId: string;
  employee: { id: string; name: string };
  task: { id: string; threadId: string | null; createdByUserId: string | null; delegatedFromTaskId: string | null };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);

const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const clampInt = (v: unknown, def: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def;
};

/**
 * Runs command-engine tools for real. Never throws for expected failures —
 * callers get `{ success: false, message }` so the failure is recorded on
 * the task and reported back to the model/owner instead of being hidden.
 * Policy (grants, approvals) is enforced by the caller *before* this runs.
 */
@Injectable()
export class WorkforceToolExecutorService {
  private readonly logger = new Logger(WorkforceToolExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ragService: RagService,
    private readonly notificationService: NotificationService,
    private readonly externalActionService: ExternalActionService,
    private readonly tasks: WorkforceTaskService,
  ) {}

  /** Internal tools + every enabled integration action for the tenant. */
  async loadToolset(tenantId: string): Promise<Map<string, WorkforceToolSpec>> {
    const actions = await this.prisma.integrationAction.findMany({
      where: { tenantId, isEnabled: true },
      select: { name: true, description: true, parameters: true, integrationId: true },
    });
    const map = new Map<string, WorkforceToolSpec>();
    for (const t of INTERNAL_TOOLS) map.set(t.name, t);
    for (const a of actions) {
      if (map.has(a.name)) continue; // internal tools win on a name clash
      map.set(
        a.name,
        buildIntegrationTool({
          name: a.name,
          description: a.description,
          parameters: toJsonSchema((a.parameters ?? {}) as Record<string, unknown>),
          integrationId: a.integrationId,
        }),
      );
    }
    return map;
  }

  async execute(ctx: ToolExecutionContext, tool: WorkforceToolSpec, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      if (tool.source === 'integration') {
        if (!tool.integrationId) return { success: false, message: 'Integration action has no integration configured.' };
        const r = await this.externalActionService.executeAction(tool.integrationId, tool.name, args);
        return { success: r.success, message: r.message || (r.success ? 'Done' : 'Failed'), data: r.data };
      }
      switch (tool.name) {
        case 'list_tasks':
          return await this.listTasks(ctx, args);
        case 'get_task':
          return await this.getTask(ctx, args);
        case 'summarize_activity':
          return await this.summarizeActivity(ctx, args);
        case 'search_knowledge_base':
          return await this.searchKnowledge(ctx, args);
        case 'get_business_metrics':
          return await this.businessMetrics(ctx, args);
        case 'list_customers':
          return await this.listCustomers(ctx, args);
        case 'fetch_webpage':
          return await this.fetchWebpage(args);
        case 'delegate_task':
          return await this.delegateTask(ctx, args);
        case 'notify_owner':
          return await this.notifyOwner(ctx, args);
        case 'send_email':
          return await this.sendEmail(ctx, args);
        default:
          return { success: false, message: `Tool "${tool.name}" has no implementation.` };
      }
    } catch (err) {
      const message = (err as Error).message || 'Tool failed';
      this.logger.warn(`Tool ${tool.name} failed for tenant=${ctx.tenantId}: ${message}`);
      return { success: false, message };
    }
  }

  private async listTasks(ctx: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    const status = str(args.status).toUpperCase();
    const employeeName = str(args.employeeName);
    let employeeIds: string[] | undefined;
    if (employeeName) {
      const employees = await this.prisma.aiEmployee.findMany({
        where: { tenantId: ctx.tenantId },
        select: { id: true, name: true, role: true, department: true, status: true },
      });
      employeeIds = matchEmployees(employeeName, employees).map((e) => e.id);
    }
    const tasks = await this.prisma.aiTask.findMany({
      where: {
        tenantId: ctx.tenantId,
        kind: { not: 'GROUP' },
        ...(status ? { status } : {}),
        ...(employeeIds ? { employeeId: { in: employeeIds } } : {}),
      },
      select: {
        id: true, title: true, status: true, priority: true, progress: true, deadline: true, updatedAt: true,
        employee: { select: { name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: clampInt(args.limit, 20, 1, 50),
    });
    return {
      success: true,
      message: `${tasks.length} task(s)`,
      data: tasks.map((t) => ({ ...t, employee: t.employee?.name ?? null })),
    };
  }

  private async getTask(ctx: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    const task = await this.prisma.aiTask.findFirst({
      where: { id: str(args.taskId, 64), tenantId: ctx.tenantId },
      include: { employee: { select: { name: true } } },
    });
    if (!task) return { success: false, message: 'Task not found.' };
    const hidden = task.confidential && task.employeeId !== ctx.employee.id;
    return {
      success: true,
      message: 'ok',
      data: {
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        employee: task.employee?.name ?? null,
        result: hidden ? '[confidential — not shared with other employees]' : task.result?.slice(0, 3000) ?? null,
        error: task.error,
      },
    };
  }

  private async summarizeActivity(ctx: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    const since = new Date();
    if (str(args.period) === 'week') since.setDate(since.getDate() - 7);
    else since.setHours(0, 0, 0, 0);

    const [completed, failed, pendingApprovals, activities] = await Promise.all([
      this.prisma.aiTask.findMany({
        where: { tenantId: ctx.tenantId, status: 'COMPLETED', completedAt: { gte: since }, kind: { not: 'GROUP' } },
        select: { title: true, confidential: true, employeeId: true, employee: { select: { name: true } } },
        take: 50,
      }),
      this.prisma.aiTask.count({ where: { tenantId: ctx.tenantId, status: 'FAILED', updatedAt: { gte: since } } }),
      this.prisma.aiEmployeeApproval.count({ where: { tenantId: ctx.tenantId, status: 'PENDING' } }),
      this.prisma.aiEmployeeActivity.findMany({
        where: { tenantId: ctx.tenantId, createdAt: { gte: since } },
        select: { action: true, status: true },
        take: 100,
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      success: true,
      message: 'ok',
      data: {
        since: since.toISOString(),
        completedTasks: completed.map((t) => ({
          title: t.confidential && t.employeeId !== ctx.employee.id ? '[confidential task]' : t.title,
          employee: t.employee?.name,
        })),
        failedTasks: failed,
        pendingApprovals,
        activityCount: activities.length,
        recentActivity: activities.slice(0, 15).map((a) => `${a.action} (${a.status})`),
      },
    };
  }

  private async searchKnowledge(ctx: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    const query = str(args.query, 300);
    if (!query) return { success: false, message: 'query is required' };
    const chunks = await this.ragService.searchTenant(ctx.tenantId, query, 4);
    if (!chunks.length) return { success: true, message: 'No matching knowledge base content found.', data: [] };
    return { success: true, message: `${chunks.length} passage(s)`, data: chunks.map((c) => c.content.slice(0, 1200)) };
  }

  private async businessMetrics(ctx: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    const days = clampInt(args.days, 30, 1, 365);
    const now = Date.now();
    const curStart = new Date(now - days * 86400e3);
    const prevStart = new Date(now - 2 * days * 86400e3);
    const t = ctx.tenantId;

    const range = async (from: Date, to: Date) => {
      const created = { gte: from, lt: to };
      const [conversations, customers, handoffs, events] = await Promise.all([
        this.prisma.conversation.count({ where: { tenantId: t, createdAt: created } }),
        this.prisma.customer.count({ where: { tenantId: t, createdAt: created } }),
        this.prisma.humanHandoff.count({ where: { tenantId: t, requestedAt: created } }),
        this.prisma.event.groupBy({
          by: ['type'],
          where: {
            tenantId: t,
            createdAt: created,
            type: { in: ['appointment.created', 'appointment.cancelled', 'appointment.completed', 'lead.created', 'action.executed'] },
          },
          _count: { _all: true },
        }),
      ]);
      const ev = Object.fromEntries(events.map((e) => [e.type, e._count._all]));
      return {
        conversations,
        newCustomers: customers,
        humanHandoffs: handoffs,
        appointmentsBooked: ev['appointment.created'] ?? 0,
        appointmentsCancelled: ev['appointment.cancelled'] ?? 0,
        appointmentsCompleted: ev['appointment.completed'] ?? 0,
        leads: ev['lead.created'] ?? 0,
        aiActionsExecuted: ev['action.executed'] ?? 0,
      };
    };

    const [current, previous] = await Promise.all([range(curStart, new Date(now)), range(prevStart, curStart)]);
    const change = Object.fromEntries(
      Object.entries(current).map(([k, v]) => {
        const p = previous[k as keyof typeof previous];
        return [k, p === 0 ? (v === 0 ? '0%' : 'new') : `${Math.round(((v - p) / p) * 100)}%`];
      }),
    );
    return {
      success: true,
      message: 'ok',
      data: {
        periodDays: days,
        current,
        previous,
        change,
        note: 'These are platform-recorded metrics (conversations, bookings, leads). Revenue/order totals are only available if a connected integration exposes them.',
      },
    };
  }

  private async listCustomers(ctx: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    const search = str(args.search, 100);
    const customers = await this.prisma.customer.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
              ],
            }
          : {}),
      },
      select: {
        id: true, name: true, email: true, phone: true, createdAt: true,
        conversations: { select: { lastMessageAt: true, status: true }, orderBy: { lastMessageAt: 'desc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
      take: clampInt(args.limit, 25, 1, 50),
    });
    return {
      success: true,
      message: `${customers.length} customer(s)`,
      data: customers.map(({ conversations, ...c }) => ({
        ...c,
        lastContactAt: conversations[0]?.lastMessageAt ?? null,
        lastConversationStatus: conversations[0]?.status ?? null,
      })),
    };
  }

  private async fetchWebpage(args: Record<string, unknown>): Promise<ToolResult> {
    const url = str(args.url, 2000);
    if (!url) return { success: false, message: 'url is required' };
    const page = await fetchPublicPage(url);
    return {
      success: page.status < 400,
      message: page.status < 400 ? `Fetched (${page.status}) in ${page.responseTimeMs}ms` : `The site responded with HTTP ${page.status}`,
      data: page,
    };
  }

  private async delegateTask(ctx: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    const title = str(args.title, 200);
    if (!title) return { success: false, message: 'title is required' };

    // Bound delegation chains so agents can't bounce work forever.
    let depth = 0;
    let cursor = ctx.task.delegatedFromTaskId;
    while (cursor && depth <= MAX_DELEGATION_DEPTH) {
      depth++;
      const parent = await this.prisma.aiTask.findFirst({ where: { id: cursor, tenantId: ctx.tenantId }, select: { delegatedFromTaskId: true } });
      cursor = parent?.delegatedFromTaskId ?? null;
    }
    if (depth >= MAX_DELEGATION_DEPTH) {
      return { success: false, message: `Delegation limit reached (max ${MAX_DELEGATION_DEPTH} hand-offs). Do the work yourself or report back.` };
    }
    const spawned = await this.prisma.aiTask.count({ where: { tenantId: ctx.tenantId, delegatedFromTaskId: ctx.task.id } });
    if (spawned >= MAX_DELEGATIONS_PER_TASK) {
      return { success: false, message: `This task already delegated ${spawned} pieces of work (max ${MAX_DELEGATIONS_PER_TASK}). Finish with what you have.` };
    }

    const employees = await this.prisma.aiEmployee.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, name: true, role: true, department: true, status: true },
    });
    const target = matchEmployees(str(args.employeeName, 100), employees).find((e) => e.id !== ctx.employee.id);
    if (!target) return { success: false, message: `No other AI employee matches "${str(args.employeeName, 100)}".` };
    if (target.status !== 'ACTIVE') return { success: false, message: `${target.name} is paused and cannot take work.` };

    const priority = PRIORITIES.has(str(args.priority).toUpperCase()) ? str(args.priority).toUpperCase() : 'MEDIUM';
    const { tasks } = await this.tasks.createTasks(ctx.tenantId, ctx.task.createdByUserId ?? '', {
      employeeIds: [target.id],
      title,
      description: `${str(args.description, 4000)}\n\n(Delegated by ${ctx.employee.name}.)`.trim(),
      priority,
      delegatedFromTaskId: ctx.task.id,
      contextTaskIds: [ctx.task.id],
      threadId: ctx.task.threadId,
    });
    const created = tasks[0]!;
    return { success: true, message: `Delegated to ${target.name} as task ${created.id}`, data: { taskId: created.id, employee: target.name } };
  }

  private async notifyOwner(ctx: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    const title = str(args.title, 150);
    const message = str(args.message, 2000);
    if (!title || !message) return { success: false, message: 'title and message are required' };
    const owners = await this.prisma.tenantMembership.findMany({
      where: { tenantId: ctx.tenantId, status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN'] } },
      select: { userId: true },
    });
    if (!owners.length) return { success: false, message: 'No active owner/admin to notify.' };
    await this.prisma.notification.createMany({
      data: owners.map((o) => ({
        tenantId: ctx.tenantId,
        userId: o.userId,
        type: 'ai_workforce.employee_message',
        title: `${ctx.employee.name}: ${title}`,
        body: message,
        metadata: { taskId: ctx.task.id, employeeId: ctx.employee.id } as Prisma.InputJsonValue,
      })),
    });
    return { success: true, message: `Notified ${owners.length} owner/admin(s).` };
  }

  private async sendEmail(ctx: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    const to = str(args.to, 254);
    const subject = str(args.subject, 200);
    const body = str(args.body, 20000);
    if (!EMAIL_RE.test(to)) return { success: false, message: `"${to}" is not a valid email address.` };
    if (!subject || !body) return { success: false, message: 'subject and body are required' };
    const r = await this.notificationService.sendEmail({ to, subject, text: body, tenantId: ctx.tenantId });
    // ResendService "simulates" success when no API key is configured — that
    // is not a sent email, and must never be reported as one.
    if (r.status === 'simulated') {
      return {
        success: false,
        message: 'Email NOT sent: no email provider is configured (RESEND_API_KEY is missing). Connect an email provider to enable sending.',
      };
    }
    return r.success
      ? { success: true, message: `Email sent to ${to}`, data: { messageId: r.messageId } }
      : { success: false, message: `Email provider rejected the message: ${r.error ?? r.status ?? 'unknown error'}` };
  }
}
