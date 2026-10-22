import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { TestApp, TenantFixture, bootApp, configureTestEnv, createTenant, deleteTenant } from './harness';

configureTestEnv();

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: TestApp;
let schedules: any;
let executor: any;
const fixtures: TenantFixture[] = [];

before(async () => {
  t = await bootApp();
  const { WorkforceScheduleService } = await import('../../src/modules/ai-workforce/workforce-schedule.service');
  const { TaskExecutorService } = await import('../../src/modules/ai-workforce/task-executor.service');
  schedules = t.get(WorkforceScheduleService);
  executor = t.get(TaskExecutorService);
});

after(async () => {
  for (const f of fixtures) await deleteTenant(t.prisma, f);
  await t.close();
});

async function tenant() {
  const f = await createTenant(t.prisma);
  fixtures.push(f);
  return f;
}

describe('recurring schedules', () => {
  test('validates cron, timezone and frequency', async () => {
    const f = await tenant();
    const base = { employeeId: f.employeeId, title: 'Morning check' };
    await assert.rejects(() => schedules.create(f.tenantId, f.ownerId, { ...base, cron: 'not a cron' }), /5-field cron/);
    await assert.rejects(() => schedules.create(f.tenantId, f.ownerId, { ...base, cron: '* * * * *' }), /Runs too often/);
    await assert.rejects(() => schedules.create(f.tenantId, f.ownerId, { ...base, cron: '0 9 * * *', timezone: 'Mars/Base' }), /Unknown timezone/);

    const s = await schedules.create(f.tenantId, f.ownerId, { ...base, cron: '0 9 * * 1-5' });
    assert.equal(s.timezone, 'Asia/Colombo', "defaults to the business's timezone");
    assert.ok(s.nextRunAt > new Date());
  });

  test('a due schedule creates exactly one run, advances, and skips overlapping runs', async () => {
    const f = await tenant();
    const s = await schedules.create(f.tenantId, f.ownerId, { employeeId: f.employeeId, title: 'No-show follow-up', cron: '0 9 * * *' });
    const due = new Date(s.nextRunAt.getTime() + 1000);

    // Two instances ticking at once must not double-create.
    // (runDue is cluster-wide, so other tests' due schedules may run too — count only ours.)
    await Promise.all([schedules.runDue(due), schedules.runDue(due), schedules.runDue(due)]);
    const runs = await t.prisma.aiTask.findMany({ where: { scheduleId: s.id } });
    assert.equal(runs.length, 1);
    assert.equal(runs[0].title, 'No-show follow-up');

    const after1 = await t.prisma.aiTaskSchedule.findUnique({ where: { id: s.id } });
    assert.ok(after1.nextRunAt > due, 'next run moved forward');

    // Next occurrence while the first run is still queued → skipped.
    const due2 = new Date(after1.nextRunAt.getTime() + 1000);
    await schedules.runDue(due2);
    assert.equal(await t.prisma.aiTask.count({ where: { scheduleId: s.id } }), 1);
    const after2 = await t.prisma.aiTaskSchedule.findUnique({ where: { id: s.id } });
    assert.equal(after2.lastStatus, 'SKIPPED_OVERLAP');
  });

  test('a schedule that keeps failing disables itself and tells the owner', async () => {
    const f = await tenant();
    const s = await schedules.create(f.tenantId, f.ownerId, {
      employeeId: f.employeeId,
      title: 'Flaky',
      cron: '0 * * * *',
      maxConsecutiveFailures: 2,
    });
    for (let i = 0; i < 2; i++) {
      const task = await schedules.runNow(f.tenantId, f.ownerId, s.id);
      t.ai.script = [new Error('Invalid API key')];
      await executor.run(task.id);
    }
    const row = await t.prisma.aiTaskSchedule.findUnique({ where: { id: s.id } });
    assert.equal(row.enabled, false);
    assert.equal(row.consecutiveFailures, 2);
    const n = await t.prisma.notification.count({ where: { tenantId: f.tenantId, type: 'ai_workforce.schedule_disabled' } });
    assert.equal(n, 1);
  });

  test("schedules are tenant-scoped", async () => {
    const a = await tenant();
    const b = await tenant();
    const s = await schedules.create(a.tenantId, a.ownerId, { employeeId: a.employeeId, title: 'A only', cron: '0 9 * * *' });
    await assert.rejects(() => schedules.get(b.tenantId, s.id), /not found/i);
    await assert.rejects(() => schedules.runNow(b.tenantId, b.ownerId, s.id), /not found/i);
    await assert.rejects(
      () => schedules.create(b.tenantId, b.ownerId, { employeeId: a.employeeId, title: 'x', cron: '0 9 * * *' }),
      /not found/i,
    );
    assert.equal((await schedules.list(b.tenantId)).length, 0);
  });
});
