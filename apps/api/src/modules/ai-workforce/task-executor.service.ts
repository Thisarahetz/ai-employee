import { Injectable, Logger } from '@nestjs/common';
import { AgentType, Prisma } from '@prisma/client';
import type { AIMessage, AIToolCall, AIToolDefinition } from '@ai-employee/ai-core';
import { PrismaService } from '../../prisma/prisma.service';
import { AiProviderService } from '../ai-provider/ai-provider.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AiEmployeeApprovalService } from '../ai-employee/ai-employee-approval.service';
import { WorkforceToolExecutorService } from './workforce-tool-executor.service';
import { WorkforceTaskService } from './workforce-task.service';
import { WorkforceScheduleService } from './workforce-schedule.service';
import { WorkforceToolSpec, evaluateToolPolicy } from './workforce-tools';
import { AiLimits, UsageLimitsService, startOfUtcDay, startOfUtcMonth } from './usage-limits.service';
import {
  AI_CALL_RETRY_DELAYS_MS,
  LimitReachedError,
  RepeatedCallGuard,
  TRANSIENT_ERROR,
  decideOnFailure,
  providerRetryAfterMs,
} from './retry-policy';

const MAX_CONSECUTIVE_FAILED_ROUNDS = 3;
/** A RUNNING task whose heartbeat is older than this is treated as crashed. */
export const STALE_HEARTBEAT_MS = 5 * 60_000;

export type RunOutcome = 'DONE' | 'NOT_CLAIMED' | 'DEFERRED';

type TaskRow = Prisma.AiTaskGetPayload<{ include: { employee: true } }>;

/** Shown to the model so it explains gaps instead of pretending. */
function capabilityGaps(toolset: Map<string, WorkforceToolSpec>): string[] {
  const names = [...toolset.values()].filter((t) => t.source === 'integration').map((t) => t.name).join(' ');
  const gaps = [
    'General web search (you can only fetch specific URLs you are given or already know)',
    'Ad platforms and web analytics (Google Analytics, Meta Ads, etc.) — not connected',
  ];
  if (!/calendar|meeting|event|availability/i.test(names)) gaps.push('Calendar access and meeting scheduling — no calendar integration connected');
  if (!/order|sale|revenue|invoice|transaction/i.test(names)) gaps.push('Sales, order and revenue figures — no POS/e-commerce integration exposes them');
  return gaps;
}

function describeCall(name: string, args: Record<string, unknown>): string {
  const parts = Object.entries(args ?? {})
    .slice(0, 4)
    .map(([k, raw]) => {
      const v = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : JSON.stringify(raw);
      return `${k}=${v.length > 60 ? `${v.slice(0, 57)}…` : v}`;
    });
  return `${name}(${parts.join(', ')})`;
}


/** Turns provider errors (often raw JSON) into one readable sentence for the owner. */
export function friendlyAiError(err: unknown): string {
  const raw = (err as Error)?.message ?? String(err);
  let msg = raw;
  try {
    const parsed = JSON.parse(raw.slice(raw.indexOf('{')));
    msg = parsed?.error?.message ?? parsed?.message ?? raw;
  } catch {
    // Not JSON — keep the original text.
  }
  if (/quota|RESOURCE_EXHAUSTED|exceeded your current/i.test(raw)) {
    return 'The AI provider quota for this account is used up (provider rate limit or plan limit).';
  }
  if (TRANSIENT_ERROR.test(raw)) {
    return `The AI provider is busy or unavailable right now (${msg.split('\n')[0]!.slice(0, 160)}).`;
  }
  return msg.slice(0, 500);
}

function compact(value: unknown, max = 2500): string {
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return s && s.length > max ? `${s.slice(0, max)}… [truncated]` : s ?? '';
}

/**
 * Runs AI workforce tasks: an LLM ↔ tool loop where every tool call passes
 * the permission policy, is recorded as a step, and is audited. Sensitive
 * calls become owner approvals instead of running. Owner pause/cancel/
 * reassign is honoured between steps. The final report's "Verified
 * outcomes" section is built from recorded steps, not from model prose, so
 * the owner can always see what really happened.
 *
 * Tasks arrive from the durable queue (TaskWorkerProcessor). Safeguards:
 * per-tenant concurrency, daily/monthly budgets checked before every model
 * call, a per-task cost cap, a step cap, repeated-call detection, and a
 * heartbeat so crashed runs are recovered by the maintenance tick.
 */
@Injectable()
export class TaskExecutorService {
  private readonly logger = new Logger(TaskExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProvider: AiProviderService,
    private readonly tools: WorkforceToolExecutorService,
    private readonly tasks: WorkforceTaskService,
    private readonly approvals: AiEmployeeApprovalService,
    private readonly audit: AuditLogService,
    private readonly limits: UsageLimitsService,
    private readonly schedules: WorkforceScheduleService,
  ) {}

  /**
   * Claims a QUEUED task (QUEUED → RUNNING, attempts+1) if the tenant is under
   * its concurrency limit. A per-tenant advisory lock makes count+claim atomic
   * across every worker instance.
   */
  private async claim(taskId: string): Promise<{ claimed: boolean; deferred: boolean }> {
    const row = await this.prisma.aiTask.findFirst({ where: { id: taskId }, select: { tenantId: true, status: true } });
    if (!row || row.status !== 'QUEUED') return { claimed: false, deferred: false };
    const limits = await this.limits.limits(row.tenantId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'aiw:' + row.tenantId}))`;
      const running = await tx.aiTask.count({ where: { tenantId: row.tenantId, status: 'RUNNING', kind: { not: 'GROUP' } } });
      if (running >= limits.maxConcurrentTasks) {
        // Mark when it will be looked at again, so the lost-job sweep leaves it alone.
        await tx.aiTask.updateMany({ where: { id: taskId, status: 'QUEUED' }, data: { nextRunAt: new Date(Date.now() + 15_000) } });
        return { claimed: false, deferred: true };
      }
      const now = new Date();
      const res = await tx.aiTask.updateMany({
        where: { id: taskId, status: 'QUEUED' },
        data: { status: 'RUNNING', startedAt: now, heartbeatAt: now, nextRunAt: null, error: null, attempts: { increment: 1 } },
      });
      return { claimed: res.count === 1, deferred: false };
    });
  }

  async run(taskId: string): Promise<RunOutcome> {
    const { claimed, deferred } = await this.claim(taskId);
    if (deferred) return 'DEFERRED';
    if (!claimed) return 'NOT_CLAIMED';

    const task = (await this.prisma.aiTask.findFirst({ where: { id: taskId }, include: { employee: true } })) as TaskRow | null;
    if (!task) return 'NOT_CLAIMED';
    const { tenantId } = task;

    if (!task.employee) {
      await this.fail(task, new Error('This task has no AI employee assigned. Reassign it to continue.'));
      return 'DONE';
    }
    if (task.employee.status !== 'ACTIVE') {
      await this.prisma.aiTask.update({ where: { id: task.id }, data: { status: 'BLOCKED', error: `${task.employee.name} is paused.` } });
      await this.tasks.addStep(tenantId, task.id, { kind: 'ERROR', status: 'BLOCKED', message: `${task.employee.name} is paused by the owner.` });
      if (task.parentTaskId) await this.tasks.refreshGroup(tenantId, task.parentTaskId);
      return 'DONE';
    }

    try {
      const limits = await this.limits.limits(tenantId);
      await this.assertBudget(tenantId, limits);

      const toolset = await this.tools.loadToolset(tenantId);
      const offered = this.offeredTools(task.employee, toolset);
      const messages = await this.buildMessages(task, toolset);
      await this.tasks.addStep(tenantId, task.id, {
        kind: 'NOTE',
        message: `Started by ${task.employee.name}${task.attempts > 1 ? ` (attempt ${task.attempts} of ${task.maxAttempts})` : ''}. Tools available: ${offered.map((t) => t.name).join(', ') || 'none'}.`,
      });

      const transcript: AIMessage[] = [];
      const repeats = new RepeatedCallGuard(2);
      let finalText = '';
      let failedRounds = 0;
      const maxSteps = limits.maxTaskSteps;

      for (let step = 0; step < maxSteps; step++) {
        if (await this.stopped(task.id)) return this.onStopped(task);

        const res = await this.callModel(task, limits, [...messages, ...transcript], offered.length ? offered : undefined);

        if (!res.toolCalls?.length) {
          finalText = res.content?.trim() ?? '';
          break;
        }
        if (await this.stopped(task.id)) return this.onStopped(task);

        if (res.toolCalls.some((c) => repeats.record(c.name, c.arguments))) {
          await this.tasks.addStep(tenantId, task.id, {
            kind: 'NOTE',
            status: 'FAILED',
            message: 'Stopped tool use: the same call was repeated several times with identical inputs.',
          });
          break;
        }

        const outcomes = await this.runToolCalls(task, toolset, res.toolCalls);
        failedRounds = outcomes.every((o) => o.status !== 'SUCCESS' && o.status !== 'PENDING') ? failedRounds + 1 : 0;

        transcript.push({ role: 'assistant', content: `I called: ${res.toolCalls.map((c) => describeCall(c.name, c.arguments)).join('; ')}` });
        transcript.push({
          role: 'user',
          content:
            `Tool results:\n${outcomes.map((o) => `- ${o.name} [${o.status}]: ${o.summary}`).join('\n')}\n\n` +
            (step + 1 >= maxSteps - 1
              ? 'You are almost out of steps. Write the final report now (no more tool calls).'
              : 'Continue the task. When you have enough information, write the final report (no more tool calls).'),
        });
        await this.prisma.aiTask.update({ where: { id: task.id }, data: { progress: Math.min(90, Math.round(((step + 1) / maxSteps) * 90)) } });

        if (failedRounds >= MAX_CONSECUTIVE_FAILED_ROUNDS) {
          await this.tasks.addStep(tenantId, task.id, { kind: 'NOTE', status: 'FAILED', message: 'Stopping tool use after repeated failures.' });
          break;
        }
      }

      if (await this.stopped(task.id)) return this.onStopped(task);

      if (!finalText) {
        const wrap = await this.callModel(task, limits, [
          ...messages,
          ...transcript,
          { role: 'user', content: 'Write the final report now, based strictly on the tool results above. Do not call tools.' },
        ]);
        finalText = wrap.content?.trim() ?? '';
      }
      if (!finalText) throw new Error('The AI model returned an empty response.');

      await this.finish(task, finalText);
    } catch (err) {
      await this.fail(task, err);
    }
    return 'DONE';
  }

  /** Budget gate + provider call (with short in-call retries) + per-task cost accounting. */
  private async callModel(task: TaskRow, limits: AiLimits, messages: AIMessage[], tools?: AIToolDefinition[]) {
    await this.assertBudget(task.tenantId, limits);
    const spent = await this.prisma.aiTask.findFirst({ where: { id: task.id }, select: { costUsd: true } });
    if (Number(spent?.costUsd ?? 0) >= limits.maxTaskCostUsd) {
      throw new LimitReachedError(
        `This task reached its cost limit ($${limits.maxTaskCostUsd.toFixed(2)}). Raise "max cost per task" or split the work, then resume it.`,
      );
    }
    const res = await this.completeWithRetry(task.id, () =>
      this.aiProvider.complete(task.tenantId, AgentType.ACTION, messages, { tools, taskId: task.id }),
    );
    await this.prisma.aiTask.update({
      where: { id: task.id },
      data: {
        inputTokens: { increment: res.inputTokens ?? 0 },
        outputTokens: { increment: res.outputTokens ?? 0 },
        costUsd: { increment: new Prisma.Decimal(res.estimatedCostUsd ?? 0) },
      },
    });
    return res;
  }

  private async assertBudget(tenantId: string, limits: AiLimits) {
    const check = await this.limits.checkBudget(tenantId, limits);
    if (!check.ok) throw new LimitReachedError(check.reason);
  }

  /** Tools the model is offered: everything the policy doesn't flatly deny. */
  private offeredTools(employee: TaskRow['employee'] & object, toolset: Map<string, WorkforceToolSpec>): AIToolDefinition[] {
    const defs: AIToolDefinition[] = [];
    for (const spec of toolset.values()) {
      const p = evaluateToolPolicy(employee, spec);
      if (p.decision === 'DENY') continue;
      defs.push({
        name: spec.name,
        description: p.decision === 'NEEDS_APPROVAL' ? `${spec.description} [Requires owner approval: the call is queued, not executed immediately.]` : spec.description,
        parameters: spec.parameters,
      });
    }
    return defs;
  }

  private async runToolCalls(task: TaskRow, toolset: Map<string, WorkforceToolSpec>, calls: AIToolCall[]) {
    const { tenantId } = task;
    // Re-load the employee: the owner may have paused it or revoked a tool mid-task.
    const employee = await this.prisma.aiEmployee.findFirst({ where: { id: task.employeeId!, tenantId } });
    const outcomes: { name: string; status: string; summary: string }[] = [];

    for (const call of calls) {
      const args = (call.arguments ?? {}) as Record<string, unknown>;
      const spec = toolset.get(call.name);
      const policy = employee
        ? evaluateToolPolicy(employee, spec)
        : { decision: 'DENY' as const, reason: 'Employee no longer exists.' };
      const auditBase = { taskId: task.id, employeeId: task.employeeId, tool: call.name, args };

      if (policy.decision === 'DENY') {
        await this.tasks.addStep(tenantId, task.id, { kind: 'TOOL_CALL', toolName: call.name, input: args, status: 'BLOCKED', message: policy.reason });
        await this.audit.record(tenantId, task.createdByUserId ?? undefined, 'ai_task.tool_blocked', 'AiTask', task.id, { ...auditBase, reason: policy.reason });
        outcomes.push({ name: call.name, status: 'BLOCKED', summary: `Not permitted: ${policy.reason}` });
        continue;
      }

      if (policy.decision === 'NEEDS_APPROVAL') {
        const approval = await this.approvals.createApproval(tenantId, {
          employeeId: employee!.id,
          taskId: task.id,
          title: `${employee!.name}: ${spec!.label}`,
          description: `${policy.reason}\nRequested for task "${task.title}": ${describeCall(call.name, args)}`,
          actionType: call.name.toUpperCase(),
          actionPayload: { kind: 'tool_call', tool: call.name, args, risk: spec!.risk },
        });
        await this.tasks.addStep(tenantId, task.id, {
          kind: 'APPROVAL_REQUESTED',
          toolName: call.name,
          input: args,
          status: 'PENDING',
          output: { approvalId: approval.id },
          message: policy.reason,
        });
        await this.audit.record(tenantId, task.createdByUserId ?? undefined, 'ai_task.approval_requested', 'AiTask', task.id, { ...auditBase, approvalId: approval.id });
        outcomes.push({ name: call.name, status: 'PENDING', summary: `Queued for owner approval (approval ${approval.id}). It has NOT been executed. Report it as pending.` });
        continue;
      }

      const result = await this.tools.execute(
        { tenantId, employee: { id: employee!.id, name: employee!.name }, task },
        spec!,
        args,
      );
      await this.tasks.addStep(tenantId, task.id, {
        kind: 'TOOL_CALL',
        toolName: call.name,
        input: args,
        output: result.data ?? null,
        status: result.success ? 'SUCCESS' : 'FAILED',
        message: result.message,
      });
      await this.audit.record(tenantId, task.createdByUserId ?? undefined, 'ai_task.tool_executed', 'AiTask', task.id, {
        ...auditBase,
        success: result.success,
        message: result.message,
      });
      outcomes.push({
        name: call.name,
        status: result.success ? 'SUCCESS' : 'FAILED',
        summary: result.success ? `${result.message}\n${compact(result.data)}` : `FAILED: ${result.message}`,
      });
    }
    return outcomes;
  }

  private async buildMessages(task: TaskRow, toolset: Map<string, WorkforceToolSpec>): Promise<AIMessage[]> {
    const { tenantId } = task;
    const emp = task.employee!;
    const [tenant, business, contextTasks, reviewTarget, ownHistory, threadMessages, previousSteps] = await Promise.all([
      this.prisma.tenant.findFirst({ where: { id: tenantId }, select: { name: true } }),
      this.prisma.business.findFirst({ where: { tenantId }, select: { name: true, type: true, timezone: true } }),
      task.contextTaskIds.length
        ? this.prisma.aiTask.findMany({
            where: { tenantId, id: { in: task.contextTaskIds } },
            select: { id: true, title: true, result: true, confidential: true, employeeId: true, employee: { select: { name: true } } },
          })
        : Promise.resolve([]),
      task.reviewOfTaskId
        ? this.prisma.aiTask.findFirst({
            where: { tenantId, id: task.reviewOfTaskId },
            select: { title: true, description: true, result: true, confidential: true, employeeId: true, employee: { select: { name: true } } },
          })
        : Promise.resolve(null),
      this.prisma.aiTask.findMany({
        where: { tenantId, employeeId: emp.id, status: 'COMPLETED', id: { not: task.id } },
        select: { title: true, result: true, completedAt: true },
        orderBy: { completedAt: 'desc' },
        take: 4,
      }),
      task.threadId
        ? this.prisma.ownerCommandMessage.findMany({
            where: { tenantId, threadId: task.threadId },
            orderBy: { createdAt: 'desc' },
            take: 6,
            select: { role: true, content: true },
          })
        : Promise.resolve([]),
      this.prisma.aiTaskStep.findMany({ where: { taskId: task.id, kind: { in: ['TOOL_CALL', 'APPROVAL_REQUESTED'] } }, orderBy: { seq: 'asc' } }),
    ]);

    const responsibilities = Array.isArray(emp.responsibilities) ? (emp.responsibilities as unknown[]).map(String) : [];
    const system = [
      `You are ${emp.name}, the ${emp.role} in the ${emp.department} department of ${business?.name ?? tenant?.name ?? 'the business'}.`,
      emp.systemPrompt?.trim(),
      responsibilities.length ? `Your responsibilities:\n${responsibilities.map((r) => `- ${r}`).join('\n')}` : '',
      [
        'You are carrying out a task assigned by the business owner, your manager. Work autonomously with your tools.',
        'RULES:',
        '- Use tools to gather real information before concluding. Only state facts that come from tool results or the context provided.',
        '- NEVER claim an action happened (email sent, meeting booked, record changed, task delegated) unless a tool result in this task confirms success.',
        '- If a tool result says the action is queued for owner approval, report it as "waiting for your approval", not as done.',
        '- If something you need is not possible with your tools, say so plainly and suggest what the owner could connect or provide.',
        '- If data is missing or a tool fails, explain the gap rather than inventing numbers.',
        '- Final answer: a concise report in markdown with sections: **Summary**, **Findings**, **Actions taken**, **Needs your attention**, **Recommended next steps**. Omit empty sections.',
      ].join('\n'),
      `CAPABILITIES NOT AVAILABLE:\n${capabilityGaps(toolset).map((g) => `- ${g}`).join('\n')}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const visible = (t: { confidential: boolean; employeeId: string | null }) => !t.confidential || t.employeeId === emp.id;
    const withheld = contextTasks.filter((t) => !visible(t)).length;

    const sections = [
      `TASK: ${task.title}`,
      task.description && task.description !== task.title ? `DETAILS FROM THE OWNER:\n${task.description}` : '',
      task.goal ? `GOAL / SUCCESS CRITERIA: ${task.goal}` : '',
      `PRIORITY: ${task.priority}${task.deadline ? ` · DEADLINE: ${task.deadline.toISOString()}` : ''}`,
      `CURRENT TIME: ${new Date().toISOString()}${business?.timezone ? ` (business timezone ${business.timezone})` : ''}`,
      business?.type ? `BUSINESS TYPE: ${business.type}` : '',
      reviewTarget
        ? visible(reviewTarget)
          ? `WORK TO REVIEW — "${reviewTarget.title}" by ${reviewTarget.employee?.name ?? 'a teammate'}:\n${(reviewTarget.result ?? '(no result recorded)').slice(0, 6000)}\n\nGive an honest review: what is strong, what is wrong or unsupported, and concrete improvements.`
          : 'WORK TO REVIEW: the referenced task is confidential and was withheld. Tell the owner you cannot review it.'
        : '',
      contextTasks.filter(visible).length
        ? `RELEVANT EARLIER RESULTS:\n${contextTasks
            .filter(visible)
            .map((t) => `- "${t.title}" (${t.employee?.name ?? 'unknown'}):\n${(t.result ?? '(no result)').slice(0, 3000)}`)
            .join('\n')}`
        : '',
      withheld ? `(${withheld} referenced task(s) are confidential to another employee and were withheld.)` : '',
      ownHistory.length
        ? `YOUR RECENT COMPLETED WORK:\n${ownHistory.map((h) => `- ${h.title}: ${(h.result ?? '').replace(/\s+/g, ' ').slice(0, 300)}`).join('\n')}`
        : '',
      threadMessages.length
        ? `RECENT CONVERSATION WITH THE OWNER (newest last):\n${threadMessages
            .reverse()
            .map((m) => `${m.role}: ${m.content.replace(/\s+/g, ' ').slice(0, 400)}`)
            .join('\n')}`
        : '',
      previousSteps.length
        ? `PROGRESS BEFORE THIS TASK WAS PAUSED (do not repeat successful actions):\n${previousSteps
            .map((s) => `- ${s.toolName} [${s.status}]: ${s.message.slice(0, 300)}`)
            .join('\n')}`
        : '',
    ].filter(Boolean);

    return [
      { role: 'system', content: system, cacheControl: true },
      { role: 'user', content: sections.join('\n\n') },
    ];
  }

  /**
   * Providers return short-lived 429/503s under load. Retry those with
   * backoff (noting it on the task) instead of failing the owner's task.
   */
  private async completeWithRetry<T>(taskId: string, call: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await call();
      } catch (err) {
        const delay = AI_CALL_RETRY_DELAYS_MS[attempt];
        // A provider asking us to wait longer than a short in-call retry (e.g. a
        // quota reset) is handed to the task-level retry instead of hammered.
        const hint = providerRetryAfterMs(err);
        if (delay === undefined || !TRANSIENT_ERROR.test((err as Error)?.message ?? '') || (hint !== null && hint > 20_000) || (await this.stopped(taskId))) throw err;
        const t = await this.prisma.aiTask.findFirst({ where: { id: taskId }, select: { tenantId: true } });
        if (t) {
          await this.tasks.addStep(t.tenantId, taskId, {
            kind: 'NOTE',
            status: 'FAILED',
            message: `AI provider busy — retrying in ${delay / 1000}s (call attempt ${attempt + 2} of ${AI_CALL_RETRY_DELAYS_MS.length + 1}).`,
          });
        }
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  /** Heartbeat + stop check in one query: false while the task is still ours and RUNNING. */
  private async stopped(taskId: string): Promise<boolean> {
    const res = await this.prisma.aiTask.updateMany({ where: { id: taskId, status: 'RUNNING' }, data: { heartbeatAt: new Date() } });
    return res.count !== 1;
  }

  private async onStopped(task: TaskRow): Promise<RunOutcome> {
    const t = await this.prisma.aiTask.findFirst({ where: { id: task.id }, select: { status: true } });
    await this.tasks.addStep(task.tenantId, task.id, { kind: 'CONTROL', message: `Execution stopped (task is now ${t?.status ?? 'deleted'}).` });
    return 'DONE';
  }

  /** Builds the authoritative outcome list from recorded steps. */
  async verifiedOutcomes(taskId: string): Promise<{ text: string; pending: number; succeeded: number; failed: number }> {
    const steps = await this.prisma.aiTaskStep.findMany({ where: { taskId }, orderBy: { seq: 'asc' } });
    const toolSteps = steps.filter((s) => s.kind === 'TOOL_CALL' || s.kind === 'APPROVAL_REQUESTED');
    const done = toolSteps.filter((s) => s.kind === 'TOOL_CALL' && s.status === 'SUCCESS');
    const failed = toolSteps.filter((s) => s.status === 'FAILED' || s.status === 'BLOCKED');
    const pending = toolSteps.filter((s) => s.kind === 'APPROVAL_REQUESTED' && s.status === 'PENDING');
    const line = (s: (typeof steps)[number]) => `- ${describeCall(s.toolName ?? 'tool', (s.input ?? {}) as Record<string, unknown>)} — ${s.message.split('\n')[0].slice(0, 160)}`;
    const parts = [
      done.length ? `**Completed tool actions**\n${done.map(line).join('\n')}` : '**Completed tool actions**\n- None',
      failed.length ? `**Failed or blocked**\n${failed.map(line).join('\n')}` : '',
      pending.length ? `**Waiting for your approval**\n${pending.map(line).join('\n')}` : '',
    ].filter(Boolean);
    return { text: `---\n_Verified outcomes (from the execution log):_\n\n${parts.join('\n\n')}`, pending: pending.length, succeeded: done.length, failed: failed.length };
  }

  private async finish(task: TaskRow, finalText: string) {
    const { tenantId } = task;
    const outcomes = await this.verifiedOutcomes(task.id);
    const status = outcomes.pending > 0 ? 'WAITING_APPROVAL' : 'COMPLETED';
    const result = `${finalText}\n\n${outcomes.text}`;

    // Don't overwrite an owner's pause/cancel that landed during the final call.
    const updated = await this.prisma.aiTask.updateMany({
      where: { id: task.id, status: 'RUNNING' },
      data: { status, result, progress: status === 'COMPLETED' ? 100 : 95, completedAt: status === 'COMPLETED' ? new Date() : null, heartbeatAt: null },
    });
    if (updated.count !== 1) return this.onStopped(task);

    await this.tasks.addStep(tenantId, task.id, { kind: 'RESULT', message: status === 'COMPLETED' ? 'Task completed.' : 'Report ready; some actions are waiting for owner approval.' });
    await this.audit.record(tenantId, task.createdByUserId ?? undefined, `ai_task.${status.toLowerCase()}`, 'AiTask', task.id, {
      employeeId: task.employeeId,
      succeeded: outcomes.succeeded,
      failed: outcomes.failed,
      pendingApprovals: outcomes.pending,
    });
    await this.prisma.aiEmployeeActivity.create({
      data: {
        tenantId,
        employeeId: task.employeeId!,
        action: `${status === 'COMPLETED' ? 'Completed' : 'Reported (awaiting approval)'}: ${task.title}`.slice(0, 250),
        category: 'OPERATIONS',
        details: finalText.replace(/\s+/g, ' ').slice(0, 400),
        status: status === 'COMPLETED' ? 'SUCCESS' : 'PENDING_APPROVAL',
      },
    });
    if (status === 'COMPLETED') await this.bumpStats(task.employeeId!);
    if (task.scheduleId) await this.schedules.recordOutcome(tenantId, task.scheduleId, status);

    if (task.threadId) {
      await this.tasks.postThreadMessage(tenantId, task.threadId, {
        role: 'AI',
        employeeId: task.employeeId,
        content: `**${task.employee!.name}** finished **${task.title}**${status === 'WAITING_APPROVAL' ? ' — some actions need your approval' : ''}.\n\n${result}`,
        metadata: { taskIds: [task.id], kind: 'task_report', status },
        focusTaskIds: [task.id],
      });
    }
    if (task.parentTaskId) await this.tasks.refreshGroup(tenantId, task.parentTaskId);
  }

  /**
   * Ends an attempt that threw. Transient errors are retried later with
   * backoff; limit errors block the task (budget limits resume on their own
   * when the period resets); anything else fails it and tells the owner.
   */
  private async fail(task: TaskRow, err: unknown) {
    const { tenantId } = task;
    const message = friendlyAiError(err);
    const current = await this.prisma.aiTask.findFirst({ where: { id: task.id }, select: { attempts: true, maxAttempts: true } });
    const decision = decideOnFailure(err, current?.attempts ?? task.attempts, current?.maxAttempts ?? task.maxAttempts);

    if (decision.action === 'RETRY') {
      const at = new Date(Date.now() + decision.delayMs);
      const moved = await this.prisma.aiTask.updateMany({
        where: { id: task.id, status: 'RUNNING' },
        data: { status: 'QUEUED', error: message.slice(0, 2000), nextRunAt: at, heartbeatAt: null },
      });
      if (moved.count !== 1) return;
      await this.tasks.addStep(tenantId, task.id, {
        kind: 'NOTE',
        status: 'FAILED',
        message: `${message} Retrying automatically at ${at.toISOString()} (attempt ${(current?.attempts ?? 0) + 1} of ${current?.maxAttempts}).`,
      });
      await this.tasks.enqueue(tenantId, task.id, decision.delayMs);
      this.logger.warn(`Task ${task.id} will retry in ${Math.round(decision.delayMs / 1000)}s: ${message}`);
      return;
    }

    if (decision.action === 'BLOCK') {
      const resumeAt = /daily/i.test(message)
        ? new Date(startOfUtcDay().getTime() + 86400e3)
        : /monthly/i.test(message)
          ? (() => {
              const m = startOfUtcMonth();
              return new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1));
            })()
          : null;
      const moved = await this.prisma.aiTask.updateMany({
        where: { id: task.id, status: 'RUNNING' },
        data: { status: 'BLOCKED', error: message.slice(0, 2000), nextRunAt: resumeAt, heartbeatAt: null },
      });
      if (moved.count !== 1) return;
      await this.tasks.addStep(tenantId, task.id, {
        kind: 'ERROR',
        status: 'BLOCKED',
        message: resumeAt ? `${message} It will resume automatically at ${resumeAt.toISOString()}.` : message,
      });
      await this.audit.record(tenantId, task.createdByUserId ?? undefined, 'ai_task.limit_reached', 'AiTask', task.id, { reason: message });
      await this.tasks.notifyOwners(tenantId, {
        type: 'ai_workforce.limit_reached',
        title: `AI limit reached: ${task.title}`,
        body: message,
        metadata: { taskId: task.id, employeeId: task.employeeId },
      });
      if (task.parentTaskId) await this.tasks.refreshGroup(tenantId, task.parentTaskId);
      return;
    }

    this.logger.warn(`Task ${task.id} failed: ${message}`);
    const moved = await this.prisma.aiTask.updateMany({
      where: { id: task.id, status: 'RUNNING' },
      data: { status: 'FAILED', error: message.slice(0, 2000), completedAt: new Date(), heartbeatAt: null },
    });
    if (moved.count !== 1) return;
    await this.tasks.addStep(tenantId, task.id, { kind: 'ERROR', status: 'FAILED', message });
    await this.audit.record(tenantId, task.createdByUserId ?? undefined, 'ai_task.failed', 'AiTask', task.id, { error: message, attempts: current?.attempts });
    if (task.employeeId) {
      await this.prisma.aiEmployeeActivity.create({
        data: { tenantId, employeeId: task.employeeId, action: `Failed: ${task.title}`.slice(0, 250), category: 'OPERATIONS', details: message.slice(0, 400), status: 'FAILED' },
      });
    }
    if (task.threadId) {
      await this.tasks.postThreadMessage(tenantId, task.threadId, {
        role: 'AI',
        employeeId: task.employeeId,
        content: `**${task.employee?.name ?? 'An AI employee'}** could not finish **${task.title}**.\n\nReason: ${message}\n\nSay “retry it” here to run it again.`,
        metadata: { taskIds: [task.id], kind: 'task_failed' },
        focusTaskIds: [task.id],
      });
    } else {
      await this.tasks.notifyOwners(tenantId, {
        type: 'ai_workforce.task_failed',
        title: `${task.employee?.name ?? 'AI employee'} could not finish: ${task.title}`,
        body: message,
        metadata: { taskId: task.id, employeeId: task.employeeId, scheduleId: task.scheduleId },
      });
    }
    if (task.scheduleId) await this.schedules.recordOutcome(tenantId, task.scheduleId, 'FAILED');
    if (task.parentTaskId) await this.tasks.refreshGroup(tenantId, task.parentTaskId);
  }

  private async bumpStats(employeeId: string) {
    const emp = await this.prisma.aiEmployee.findFirst({ where: { id: employeeId }, select: { stats: true } });
    const stats = (emp?.stats ?? {}) as Record<string, number>;
    await this.prisma.aiEmployee.update({
      where: { id: employeeId },
      data: { stats: { ...stats, tasksCompleted: (stats.tasksCompleted ?? 0) + 1 } },
    });
  }
}
