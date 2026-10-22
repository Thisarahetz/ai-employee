import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { TestApp, TenantFixture, bootApp, configureTestEnv, createTenant, deleteTenant } from './harness';

configureTestEnv();

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: TestApp;
let tasks: any;
let executor: any;
let maintenance: any;
let approvals: any;
let usage: any;
const fixtures: TenantFixture[] = [];

before(async () => {
  t = await bootApp();
  const { WorkforceTaskService } = await import('../../src/modules/ai-workforce/workforce-task.service');
  const { TaskExecutorService } = await import('../../src/modules/ai-workforce/task-executor.service');
  const { WorkforceMaintenanceService } = await import('../../src/modules/ai-workforce/workforce-maintenance.service');
  const { WorkforceApprovalService } = await import('../../src/modules/ai-workforce/workforce-approval.service');
  const { UsageLimitsService } = await import('../../src/modules/ai-workforce/usage-limits.service');
  tasks = t.get(WorkforceTaskService);
  executor = t.get(TaskExecutorService);
  maintenance = t.get(WorkforceMaintenanceService);
  approvals = t.get(WorkforceApprovalService);
  usage = t.get(UsageLimitsService);
});

after(async () => {
  for (const f of fixtures) await deleteTenant(t.prisma, f);
  await t.close();
});

beforeEach(() => {
  t.ai.script = [];
  t.ai.calls = [];
});

async function tenant(o?: Parameters<typeof createTenant>[1]) {
  const f = await createTenant(t.prisma, o);
  fixtures.push(f);
  return f;
}

async function newTask(f: TenantFixture, title = 'Review this week', extra: Record<string, unknown> = {}) {
  const { tasks: created } = await tasks.createTasks(f.tenantId, f.ownerId, { employeeIds: [f.employeeId], title, ...extra });
  return created[0];
}

const reload = (id: string) => t.prisma.aiTask.findUnique({ where: { id } });
const steps = (id: string) => t.prisma.aiTaskStep.findMany({ where: { taskId: id }, orderBy: { seq: 'asc' } });

describe('task execution', () => {
  test('runs a tool loop on real tenant data and records cost, steps and verified outcomes', async () => {
    const f = await tenant();
    await t.prisma.customer.create({ data: { tenantId: f.tenantId, name: 'Nadeesha Perera', phone: '+94770000001' } });
    t.ai.script = [
      { toolCalls: [{ name: 'list_customers', arguments: { limit: 5 } }], costUsd: 0.002 },
      (msgs) => {
        const last = msgs[msgs.length - 1]!.content;
        assert.match(last, /Nadeesha Perera/, 'the model sees the real tool result');
        return { content: '**Summary**\nOne customer on file.', costUsd: 0.003 };
      },
    ];
    const task = await newTask(f);
    assert.equal(await executor.run(task.id), 'DONE');

    const done = await reload(task.id);
    assert.equal(done.status, 'COMPLETED');
    assert.equal(done.attempts, 1);
    assert.equal(Number(done.costUsd).toFixed(3), '0.005');
    assert.match(done.result, /Verified outcomes/);
    assert.match(done.result, /list_customers/);

    const toolStep = (await steps(task.id)).find((s: any) => s.kind === 'TOOL_CALL');
    assert.equal(toolStep.status, 'SUCCESS');
    const logs = await t.prisma.aiUsageLog.findMany({ where: { taskId: task.id } });
    assert.equal(logs.length, 2, 'every model call is attributed to the task');
  });

  test('sensitive actions wait for owner approval and are never executed by the model', async () => {
    const f = await tenant({ employee: { connectedTools: ['email.send', 'tasks.read'], toolAccessConfigured: true } });
    t.ai.script = [
      { toolCalls: [{ name: 'send_email', arguments: { to: 'client@example.com', subject: 'Hi', body: 'Hello' } }] },
      { content: 'Email drafted and waiting for your approval.' },
    ];
    const task = await newTask(f, 'Email a client');
    await executor.run(task.id);

    const waiting = await reload(task.id);
    assert.equal(waiting.status, 'WAITING_APPROVAL');
    const approval = await t.prisma.aiEmployeeApproval.findFirst({ where: { taskId: task.id } });
    assert.equal(approval.status, 'PENDING');
    const notes = await t.prisma.notification.count({ where: { tenantId: f.tenantId, type: 'ai_employee.approval_requested' } });
    assert.equal(notes, 1, 'owner is notified');

    await approvals.decide(f.tenantId, f.ownerId, approval.id, 'REJECTED', 'Not now');
    const settled = await reload(task.id);
    assert.equal(settled.status, 'COMPLETED');
    assert.match(settled.result, /rejected — not executed/);
  });

  test('transient provider errors are retried later, then fail and notify the owner', async () => {
    const f = await tenant();
    const task = await newTask(f, 'Daily check', { maxAttempts: 2 });
    const outage = new Error('503 UNAVAILABLE: model overloaded');
    // Each attempt makes 1 call + 3 in-call retries; shorten them for the test.
    const policy = await import('../../src/modules/ai-workforce/retry-policy');
    const saved = [...policy.AI_CALL_RETRY_DELAYS_MS];
    policy.AI_CALL_RETRY_DELAYS_MS.splice(0, saved.length);
    try {
      t.ai.script = [outage];
      await executor.run(task.id);
      let row = await reload(task.id);
      assert.equal(row.status, 'QUEUED', 'scheduled for an automatic retry');
      assert.equal(row.attempts, 1);
      assert.ok(row.nextRunAt > new Date(), 'retry is delayed');

      t.ai.script = [outage];
      await executor.run(task.id);
      row = await reload(task.id);
      assert.equal(row.status, 'FAILED', 'gives up after maxAttempts');
      assert.equal(row.attempts, 2);
      const n = await t.prisma.notification.count({ where: { tenantId: f.tenantId, type: 'ai_workforce.task_failed' } });
      assert.equal(n, 1);

      // An owner retry grants fresh attempts.
      await tasks.control(f.tenantId, f.ownerId, task.id, 'RESUME');
      row = await reload(task.id);
      assert.equal(row.status, 'QUEUED');
      assert.ok(row.maxAttempts > row.attempts);
    } finally {
      policy.AI_CALL_RETRY_DELAYS_MS.push(...saved);
    }
  });

  test('non-transient errors fail immediately without retrying', async () => {
    const f = await tenant();
    const task = await newTask(f);
    t.ai.script = [new Error('Invalid API key provided')];
    await executor.run(task.id);
    const row = await reload(task.id);
    assert.equal(row.status, 'FAILED');
    assert.equal(row.attempts, 1);
  });
});

describe('cost and loop safeguards', () => {
  test('a daily budget blocks work and it resumes automatically the next day', async () => {
    const f = await tenant();
    await usage.updateSettings(f.tenantId, f.ownerId, { dailyBudgetUsd: 0.01 });
    await t.prisma.aiUsageLog.create({
      data: { tenantId: f.tenantId, agentType: 'SUPPORT', provider: 'GEMINI', model: 'x', inputTokens: 1, outputTokens: 1, estimatedCostUsd: 0.02, executionTimeMs: 1 },
    });
    const task = await newTask(f);
    await executor.run(task.id);
    const row = await reload(task.id);
    assert.equal(row.status, 'BLOCKED');
    assert.match(row.error, /Daily AI budget reached/);
    assert.ok(row.nextRunAt, 'auto-resume time is set');
    assert.equal(t.ai.calls.length, 0, 'no model call was made over budget');

    const tomorrow = new Date(row.nextRunAt.getTime() + 1000);
    const resumed = await maintenance.resumeBudgetBlocked(tomorrow);
    assert.equal(resumed, 1);
    assert.equal((await reload(task.id)).status, 'QUEUED');
  });

  test('the AI kill switch stops new tasks', async () => {
    const f = await tenant();
    await usage.updateSettings(f.tenantId, f.ownerId, { aiEnabled: false });
    await assert.rejects(() => newTask(f), /switched off/);
  });

  test('per-task cost cap stops a runaway task', async () => {
    const f = await tenant();
    await usage.updateSettings(f.tenantId, f.ownerId, { maxTaskCostUsd: 0.01 });
    t.ai.script = Array.from({ length: 6 }, (_, i) => ({ toolCalls: [{ name: 'list_tasks', arguments: { limit: i + 1 } }], costUsd: 0.006 }));
    const task = await newTask(f);
    await executor.run(task.id);
    const row = await reload(task.id);
    assert.equal(row.status, 'BLOCKED');
    assert.match(row.error, /cost limit/);
    assert.equal(row.nextRunAt, null, 'a per-task cap needs the owner, not the calendar');
    assert.ok(t.ai.calls.length <= 3);
  });

  test('a model repeating the identical call is stopped', async () => {
    const f = await tenant();
    t.ai.script = [
      ...Array.from({ length: 3 }, () => ({ toolCalls: [{ name: 'list_tasks', arguments: { limit: 3 } }] })),
      // The forced final report is requested without tools, so the model must answer in text.
      { content: 'Report.' },
    ];
    const task = await newTask(f);
    await executor.run(task.id);
    const row = await reload(task.id);
    assert.equal(row.status, 'COMPLETED');
    const toolCalls = (await steps(task.id)).filter((s: any) => s.kind === 'TOOL_CALL');
    assert.equal(toolCalls.length, 2, 'third identical call was refused');
    assert.ok((await steps(task.id)).some((s: any) => /repeated several times/.test(s.message)));
  });

  test('step cap from tenant settings bounds the loop', async () => {
    const f = await tenant();
    await usage.updateSettings(f.tenantId, f.ownerId, { maxTaskSteps: 2 });
    const task = await newTask(f);
    t.ai.script = [
      { toolCalls: [{ name: 'list_tasks', arguments: { limit: 1 } }] },
      { toolCalls: [{ name: 'list_tasks', arguments: { limit: 2 } }] },
      { content: 'Wrapped up.' },
    ];
    await executor.run(task.id);
    const row = await reload(task.id);
    assert.equal(row.status, 'COMPLETED');
    assert.equal(t.ai.calls.length, 3, '2 steps + 1 forced final report');
  });

  test('daily task cap rejects new work', async () => {
    const f = await tenant();
    await usage.updateSettings(f.tenantId, f.ownerId, { maxTasksPerDay: 1 });
    await newTask(f, 'first');
    await assert.rejects(() => newTask(f, 'second'), /Daily task limit/);
  });

  test('per-tenant concurrency defers extra tasks instead of running them', async () => {
    const f = await tenant();
    await usage.updateSettings(f.tenantId, f.ownerId, { maxConcurrentTasks: 1 });
    const a = await newTask(f, 'a');
    const b = await newTask(f, 'b');
    await t.prisma.aiTask.update({ where: { id: a.id }, data: { status: 'RUNNING', heartbeatAt: new Date() } });
    assert.equal(await executor.run(b.id), 'DEFERRED');
    assert.equal((await reload(b.id)).status, 'QUEUED');
  });

  test('limit settings are validated and capped', async () => {
    const f = await tenant();
    await assert.rejects(() => usage.updateSettings(f.tenantId, f.ownerId, { maxTaskSteps: 500 }), /between 1 and 30/);
    await assert.rejects(() => usage.updateSettings(f.tenantId, f.ownerId, { dailyBudgetUsd: -1 }), /between 0/);
    await assert.rejects(() => usage.updateSettings(f.tenantId, f.ownerId, { maxTaskCostUsd: null }), /cannot be unlimited/);
  });
});

describe('crash recovery', () => {
  test('a task whose worker died is re-queued, or paused when out of attempts', async () => {
    const f = await tenant();
    const old = new Date(Date.now() - 10 * 60_000);
    const retryable = await newTask(f, 'r');
    const exhausted = await newTask(f, 'e');
    await t.prisma.aiTask.update({ where: { id: retryable.id }, data: { status: 'RUNNING', heartbeatAt: old, attempts: 1 } });
    await t.prisma.aiTask.update({ where: { id: exhausted.id }, data: { status: 'RUNNING', heartbeatAt: old, attempts: 3, maxAttempts: 3 } });
    const fresh = await newTask(f, 'healthy');
    await t.prisma.aiTask.update({ where: { id: fresh.id }, data: { status: 'RUNNING', heartbeatAt: new Date() } });

    const r = await maintenance.recoverStale();
    assert.ok(r.recovered >= 1 && r.paused >= 1);
    assert.equal((await reload(retryable.id)).status, 'QUEUED');
    assert.equal((await reload(exhausted.id)).status, 'PAUSED');
    assert.equal((await reload(fresh.id)).status, 'RUNNING', 'a live task is untouched');
  });
});

describe('tenant isolation', () => {
  test("one business can never read or act on another business's tasks or data", async () => {
    const a = await tenant({ name: 'Business A' });
    const b = await tenant({ name: 'Business B' });
    await t.prisma.customer.create({ data: { tenantId: a.tenantId, name: 'Secret Customer A', phone: '+94771111111' } });
    const aTask = await newTask(a, 'A confidential plan');

    await assert.rejects(() => tasks.get(b.tenantId, aTask.id), /not found/i);
    const bList = await tasks.list(b.tenantId);
    assert.ok(!bList.some((x: any) => x.id === aTask.id));
    await assert.rejects(() => tasks.control(b.tenantId, b.ownerId, aTask.id, 'CANCEL'), /not found/i);
    await assert.rejects(
      () => tasks.createTasks(b.tenantId, b.ownerId, { employeeIds: [a.employeeId], title: 'hijack' }),
      /not found/i,
      "can't assign work to another tenant's employee",
    );

    // B's AI employee looks for A's customers and tasks through its tools.
    t.ai.script = [
      { toolCalls: [{ name: 'list_customers', arguments: { search: 'Secret' } }, { name: 'get_task', arguments: { taskId: aTask.id } }] },
      (msgs) => {
        const results = msgs[msgs.length - 1]!.content;
        assert.doesNotMatch(results, /Secret Customer A/);
        assert.match(results, /Task not found/);
        return { content: 'Nothing found.' };
      },
    ];
    const bTask = await newTask(b, 'Snoop');
    await executor.run(bTask.id);
    assert.equal((await reload(bTask.id)).status, 'COMPLETED');
    assert.ok(t.ai.calls.every((c) => c.tenantId === b.tenantId), 'all model calls are billed to B');
  });
});
