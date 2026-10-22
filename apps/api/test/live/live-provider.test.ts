/**
 * Opt-in: runs one real AI workforce task against the configured provider
 * (uses real API credit). Isolated test database; fixtures are deleted after.
 *
 *   LIVE_AI=1 pnpm --filter @ai-employee/api test:live
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { configureTestEnv, createTenant, deleteTenant, TenantFixture } from '../integration/harness';

const enabled = process.env.LIVE_AI === '1';
configureTestEnv();
// Bring the real provider keys from .env (the harness doesn't copy them).
for (const line of readFileSync(resolve(__dirname, '../../../../.env'), 'utf8').split('\n')) {
  const m = line.match(/^(GEMINI_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|AI_DEFAULT_PROVIDER|AI_DEFAULT_MODEL)=(.+)$/);
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim();
}

/* eslint-disable @typescript-eslint/no-explicit-any */
let app: any;
let prisma: any;
let f: TenantFixture;

before(async () => {
  if (!enabled) return;
  const { Test } = await import('@nestjs/testing');
  const { AppModule } = await import('../../src/app.module');
  const { PrismaService } = await import('../../src/prisma/prisma.service');
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication({ logger: ['error', 'warn'] });
  await app.init();
  prisma = app.get(PrismaService);
});

after(async () => {
  if (!enabled) return;
  if (f) await deleteTenant(prisma, f);
  await app.close();
});

test('a real model completes a task with real tools and real cost tracking', { skip: !enabled && 'set LIVE_AI=1' }, async () => {
  const { WorkforceTaskService } = await import('../../src/modules/ai-workforce/workforce-task.service');
  const { TaskExecutorService } = await import('../../src/modules/ai-workforce/task-executor.service');
  f = await createTenant(prisma, { name: 'Glow Studio Colombo' });
  for (const [name, phone] of [['Nadeesha Perera', '+94770000001'], ['Kasun Silva', '+94770000002'], ['Dilini Fernando', '+94770000003']]) {
    await prisma.customer.create({ data: { tenantId: f.tenantId, name, phone } });
  }
  const { tasks } = await app.get(WorkforceTaskService).createTasks(f.tenantId, f.ownerId, {
    employeeIds: [f.employeeId],
    title: 'How many customers do we have on file? List their first names.',
  });
  await app.get(TaskExecutorService).run(tasks[0].id);

  const row = await prisma.aiTask.findUnique({ where: { id: tasks[0].id }, include: { steps: true } });
  console.log(`status=${row.status} cost=$${Number(row.costUsd).toFixed(5)} tokens=${row.inputTokens}/${row.outputTokens}`);
  console.log(row.result ?? row.error);
  assert.equal(row.status, 'COMPLETED', row.error ?? '');
  assert.ok(row.steps.some((s: any) => s.kind === 'TOOL_CALL' && s.toolName === 'list_customers' && s.status === 'SUCCESS'), 'used the real customer tool');
  assert.match(row.result, /Nadeesha/);
  assert.ok(row.inputTokens > 0 && Number(row.costUsd) > 0, 'cost recorded from the real provider response');
});
