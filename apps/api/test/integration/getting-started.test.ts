import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { TestApp, TenantFixture, bootApp, configureTestEnv, createTenant, deleteTenant } from './harness';

configureTestEnv();

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: TestApp;
let setup: any;
const fixtures: TenantFixture[] = [];

before(async () => {
  t = await bootApp();
  const { BusinessSetupService } = await import('../../src/modules/business-setup/business-setup.service');
  setup = t.get(BusinessSetupService);
});
after(async () => {
  for (const f of fixtures) await deleteTenant(t.prisma, f);
  await t.close();
});

const done = (g: any, key: string) => g.steps.find((s: any) => s.key === key).done;

test('the guide follows real setup progress, step by step', async () => {
  const f = await createTenant(t.prisma);
  fixtures.push(f);
  await t.prisma.aiEmployee.deleteMany({ where: { tenantId: f.tenantId } });

  let g = await setup.gettingStarted(f.tenantId);
  assert.equal(g.requiredCompleted, 0, 'a brand-new business has done nothing yet');
  assert.equal(g.next.key, 'team', 'first step: set up the AI team');
  assert.equal(g.isComplete, false);

  await setup.apply(f.tenantId, f.ownerId, (await t.prisma.industryTemplate.findFirst({ where: { tenantId: null, key: 'PHONE_SHOP' } })).id, {});
  await setup.updateProfile(f.tenantId, f.ownerId, { description: 'Mobile phone shop in Kandy', services: 'Screen repair Rs 8,000' });
  g = await setup.gettingStarted(f.tenantId);
  assert.ok(done(g, 'team') && done(g, 'profile'));
  assert.equal(done(g, 'schedule'), false, 'template schedules start switched off');
  assert.equal(g.next.key, 'knowledge');

  const kb = await t.prisma.knowledgeBase.create({ data: { tenantId: f.tenantId, name: 'Info' } });
  await t.prisma.document.create({ data: { tenantId: f.tenantId, knowledgeBaseId: kb.id, title: 'Prices', sourceType: 'TEXT', status: 'PROCESSING' } });
  g = await setup.gettingStarted(f.tenantId);
  assert.equal(done(g, 'knowledge'), false, 'a document still processing does not count');

  await t.prisma.document.updateMany({ where: { tenantId: f.tenantId }, data: { status: 'READY' } });
  await t.prisma.channel.create({ data: { tenantId: f.tenantId, type: 'WEBSITE_CHAT', name: 'Site', status: 'ACTIVE' } });
  const customer = await t.prisma.customer.create({ data: { tenantId: f.tenantId, name: 'Test' } });
  const ch = await t.prisma.channel.findFirst({ where: { tenantId: f.tenantId } });
  await t.prisma.conversation.create({ data: { tenantId: f.tenantId, customerId: customer.id, channelId: ch.id } });
  await t.prisma.tenantAiSettings.create({ data: { tenantId: f.tenantId, dailyBudgetUsd: 2 } });
  await t.prisma.aiTaskSchedule.updateMany({ where: { tenantId: f.tenantId }, data: { enabled: true } });
  await t.prisma.aiTask.create({ data: { tenantId: f.tenantId, title: 'Summary', createdByUserId: f.ownerId, status: 'COMPLETED' } });

  g = await setup.gettingStarted(f.tenantId);
  assert.equal(g.isComplete, true, 'all essential steps done');
  assert.equal(done(g, 'staff'), false, 'optional steps stay open');

  const hidden = await setup.setGettingStartedDismissed(f.tenantId, f.ownerId, true);
  assert.equal(hidden.dismissed, true);
  assert.equal((await setup.setGettingStartedDismissed(f.tenantId, f.ownerId, false)).dismissed, false);
});
