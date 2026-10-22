import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { TestApp, TenantFixture, bootApp, configureTestEnv, createTenant, deleteTenant, waitFor } from './harness';

configureTestEnv();

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: TestApp;
let tasks: any;
let executor: any;
let maintenance: any;
let schedules: any;
let rules: any;
let events: any;
let workflows: any;
const fixtures: TenantFixture[] = [];

before(async () => {
  t = await bootApp();
  const m = {
    tasks: await import('../../src/modules/ai-workforce/workforce-task.service'),
    exec: await import('../../src/modules/ai-workforce/task-executor.service'),
    maint: await import('../../src/modules/ai-workforce/workforce-maintenance.service'),
    sched: await import('../../src/modules/ai-workforce/workforce-schedule.service'),
    rules: await import('../../src/modules/ai-workforce/automation-rule.service'),
    events: await import('../../src/events/event.service'),
    wf: await import('../../src/modules/workflow/workflow-event-listener.service'),
  };
  tasks = t.get(m.tasks.WorkforceTaskService);
  executor = t.get(m.exec.TaskExecutorService);
  maintenance = t.get(m.maint.WorkforceMaintenanceService);
  schedules = t.get(m.sched.WorkforceScheduleService);
  rules = t.get(m.rules.AutomationRuleService);
  events = t.get(m.events.EventService);
  workflows = t.get(m.wf.WorkflowEventListenerService);
});

after(async () => {
  for (const f of fixtures) await deleteTenant(t.prisma, f);
  await t.close();
});

beforeEach(() => {
  t.ai.script = [];
  t.ai.calls = [];
});

async function tenant() {
  const f = await createTenant(t.prisma);
  fixtures.push(f);
  return f;
}

const alerts = (f: TenantFixture) =>
  t.prisma.notification.findMany({ where: { tenantId: f.tenantId, type: 'ai_workforce.setup_problem' } });

const clearDescription = (f: TenantFixture) =>
  t.prisma.business.updateMany({ where: { tenantId: f.tenantId }, data: { profile: {} } });

describe('setup check before AI work runs', () => {
  test('a task does not run while setup is broken, alerts once, and continues after the fix', async () => {
    const f = await tenant();
    await clearDescription(f);
    const { tasks: created } = await tasks.createTasks(f.tenantId, f.ownerId, { employeeIds: [f.employeeId], title: 'Weekly review' });
    const task = created[0];

    assert.equal(await executor.run(task.id), 'DONE');
    let row = await t.prisma.aiTask.findUnique({ where: { id: task.id } });
    assert.equal(row.status, 'BLOCKED');
    assert.match(row.error, /business description is empty/);
    assert.ok(row.nextRunAt > new Date(), 'scheduled to check again');
    assert.equal(row.attempts, 0, 'a blocked check is not an attempt');
    assert.equal(t.ai.calls.length, 0, 'the AI was never called');
    const first = await alerts(f);
    assert.equal(first.length, 1);
    assert.equal(first[0].metadata.href, '/business-setup');

    // The re-check finds the same problem: no new alert, no repeated log line.
    await t.prisma.aiTask.update({ where: { id: task.id }, data: { nextRunAt: new Date(Date.now() - 1000) } });
    await maintenance.resumeBudgetBlocked();
    await executor.run(task.id);
    assert.equal((await alerts(f)).length, 1);
    const blockedSteps = await t.prisma.aiTaskStep.count({ where: { taskId: task.id, status: 'BLOCKED' } });
    assert.equal(blockedSteps, 1);

    // Owner fixes it: the next check runs the task.
    await t.prisma.business.updateMany({ where: { tenantId: f.tenantId }, data: { profile: { description: 'A salon.' } } });
    await t.prisma.aiTask.update({ where: { id: task.id }, data: { nextRunAt: new Date(Date.now() - 1000) } });
    await maintenance.resumeBudgetBlocked();
    t.ai.script = [{ content: '**Summary**\nDone.' }];
    await executor.run(task.id);
    row = await t.prisma.aiTask.findUnique({ where: { id: task.id } });
    assert.equal(row.status, 'COMPLETED');
  });

  test('a missing or rejected AI key stops work', async () => {
    const f = await tenant();
    const saved = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const { tasks: created } = await tasks.createTasks(f.tenantId, f.ownerId, { employeeIds: [f.employeeId], title: 'Check stock' });
      await executor.run(created[0].id);
      const row = await t.prisma.aiTask.findUnique({ where: { id: created[0].id } });
      assert.equal(row.status, 'BLOCKED');
      assert.match(row.error, /No Gemini API key/);
    } finally {
      process.env.GEMINI_API_KEY = saved;
    }

    const g = await tenant();
    await t.prisma.tenantAiProviderKey.create({
      data: { tenantId: g.tenantId, provider: 'GEMINI', encryptedKey: 'x', keyHint: 'abcd', lastError: '401 invalid key' },
    });
    const { tasks: created } = await tasks.createTasks(g.tenantId, g.ownerId, { employeeIds: [g.employeeId], title: 'Check stock' });
    await executor.run(created[0].id);
    const row = await t.prisma.aiTask.findUnique({ where: { id: created[0].id } });
    assert.match(row.error, /Gemini API key was rejected/);
    assert.equal((await alerts(g))[0].metadata.href, '/ai-configuration');
  });

  test('a schedule skips its run when its AI employee is paused', async () => {
    const f = await tenant();
    const s = await schedules.create(f.tenantId, f.ownerId, { employeeId: f.employeeId, title: 'Morning report', cron: '0 9 * * *' });
    await t.prisma.aiEmployee.update({ where: { id: f.employeeId }, data: { status: 'PAUSED' } });
    await t.prisma.aiTaskSchedule.update({ where: { id: s.id }, data: { nextRunAt: new Date(Date.now() - 1000) } });
    await schedules.runDue();
    const row = await t.prisma.aiTaskSchedule.findUnique({ where: { id: s.id } });
    assert.equal(row.lastStatus, 'SKIPPED_SETUP');
    assert.equal(await t.prisma.aiTask.count({ where: { scheduleId: s.id } }), 0, 'no task created');
    const [alert] = await alerts(f);
    assert.match(alert.body, /is paused.*"Morning report" did not run/);
  });

  test('an automation does not fire when the integration that sent the event is disconnected', async () => {
    const f = await tenant();
    const integration = await t.prisma.integration.create({
      data: { tenantId: f.tenantId, name: 'GlowDesk', type: 'STANDARD_API', status: 'ERROR' },
    });
    await rules.create(f.tenantId, f.ownerId, {
      name: 'Rebook cancellations',
      triggerEvent: 'appointment.cancelled',
      employeeId: f.employeeId,
      taskTitle: 'Offer a new time',
    });
    await events.emit(f.tenantId, 'appointment.cancelled', { customerId: 'c1', integrationId: integration.id });
    const run = await waitFor(() => t.prisma.aiAutomationRun.findFirst({ where: { tenantId: f.tenantId } }));
    assert.equal(run.status, 'SKIPPED_SETUP');
    assert.match(run.message, /GlowDesk is not working/);
    assert.equal(await t.prisma.aiTask.count({ where: { tenantId: f.tenantId } }), 0);
    await waitFor(async () => (await alerts(f)).length === 1);
  });

  test('an n8n workflow is not triggered when n8n is not set up', async () => {
    const f = await tenant();
    const wf = await t.prisma.workflow.create({
      data: { tenantId: f.tenantId, name: 'Lead follow-up', n8nWorkflowId: 'lead-follow-up', triggerEventType: 'lead.created' },
    });
    await (workflows as any).triggerWorkflow(wf, 'lead.created', f.tenantId, { tenantId: f.tenantId });
    const exec = await t.prisma.workflowExecution.findFirst({ where: { workflowId: wf.id } });
    assert.equal(exec.status, 'FAILED');
    assert.match(exec.errorMessage, /n8n\) is not set up/);
    assert.equal((await alerts(f)).length, 1);
  });
});
