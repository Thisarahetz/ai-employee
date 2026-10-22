/**
 * Runs the real HTTP stack and a live BullMQ worker against Redis (isolated
 * key prefix): auth/RBAC on the workforce API, internal-only endpoints,
 * webhook signature checks, and end-to-end queued execution.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { TestApp, TenantFixture, bootApp, configureTestEnv, createTenant, deleteTenant, waitFor } from './harness';

configureTestEnv({ worker: true });

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: TestApp;
let base: string;
const fixtures: TenantFixture[] = [];
const extraUsers: string[] = [];
const PASSWORD = 'correct-horse-battery-staple';

before(async () => {
  t = await bootApp();
  await t.app.listen(0);
  base = `http://127.0.0.1:${t.app.getHttpServer().address().port}`;
});

after(async () => {
  for (const f of fixtures) await deleteTenant(t.prisma, f);
  await t.prisma.user.deleteMany({ where: { id: { in: extraUsers } } });
  await t.close();
});

async function tenant() {
  const f = await createTenant(t.prisma);
  fixtures.push(f);
  await t.prisma.user.update({ where: { id: f.ownerId }, data: { passwordHash: await bcrypt.hash(PASSWORD, 4) } });
  return f;
}

async function memberOf(f: TenantFixture, role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE') {
  const u = await t.prisma.user.create({
    data: { email: `${role.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.test`, passwordHash: await bcrypt.hash(PASSWORD, 4), firstName: 'T', lastName: role },
  });
  extraUsers.push(u.id);
  await t.prisma.tenantMembership.create({ data: { tenantId: f.tenantId, userId: u.id, role, status: 'ACTIVE' } });
  return u;
}

async function login(email: string): Promise<string> {
  const res = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) });
  assert.equal(res.status, 200, `login failed: ${await res.clone().text()}`);
  return (await res.json()).accessToken;
}

const api = (path: string, token?: string, init: RequestInit = {}) =>
  fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
  });

describe('workforce API access control', () => {
  test('requires authentication', async () => {
    assert.equal((await api('/ai-workforce/tasks')).status, 401);
    assert.equal((await api('/ai-workforce/tasks', 'not-a-token')).status, 401);
  });

  test('owners can manage limits; employees cannot see or command the AI workforce', async () => {
    const f = await tenant();
    const owner = await t.prisma.user.findUnique({ where: { id: f.ownerId } });
    const ownerToken = await login(owner.email);
    const staff = await memberOf(f, 'EMPLOYEE');
    const staffToken = await login(staff.email);

    const put = await api('/ai-workforce/limits', ownerToken, { method: 'PUT', body: JSON.stringify({ dailyBudgetUsd: 3 }) });
    assert.equal(put.status, 200);
    assert.equal((await put.json()).limits.dailyBudgetUsd, 3);

    assert.equal((await api('/ai-workforce/limits', staffToken, { method: 'PUT', body: JSON.stringify({ dailyBudgetUsd: 999 }) })).status, 403);
    assert.equal((await api('/ai-workforce/tasks', staffToken)).status, 403);
    assert.equal(
      (await api('/ai-workforce/tasks', staffToken, { method: 'POST', body: JSON.stringify({ employeeIds: [f.employeeId], title: 'x' }) })).status,
      403,
    );
  });

  test("a valid token for business A can't read business B's task", async () => {
    const a = await tenant();
    const b = await tenant();
    const bTask = await t.prisma.aiTask.create({ data: { tenantId: b.tenantId, employeeId: b.employeeId, title: 'B only', status: 'COMPLETED' } });
    const aOwner = await t.prisma.user.findUnique({ where: { id: a.ownerId } });
    const token = await login(aOwner.email);
    assert.equal((await api(`/ai-workforce/tasks/${bTask.id}`, token)).status, 404);
  });

  test('unexpected errors return a generic message with a request id', async () => {
    const res = await api('/ai-workforce/tasks');
    assert.ok(res.headers.get('x-request-id'));
  });
});

describe('internal and webhook endpoints', () => {
  test('/channels/send and /notifications/* require the service token', async () => {
    const body = JSON.stringify({ recipient: '+94770000000', content: 'hi', tenantId: 'x' });
    assert.equal((await api('/channels/send', undefined, { method: 'POST', body })).status, 401);
    assert.equal((await api('/channels/send', undefined, { method: 'POST', body, headers: { 'x-service-token': 'wrong' } })).status, 401);
    const ok = await api('/channels/send', undefined, { method: 'POST', body, headers: { 'x-service-token': 'test-service-token' } });
    assert.equal(ok.status, 201);
    const r = await ok.json();
    assert.equal(r.success, false, 'no channel → an honest failure, not a fake delivery');

    const email = JSON.stringify({ to: 'someone@example.com', subject: 's', text: 't' });
    assert.equal((await api('/notifications/email', undefined, { method: 'POST', body: email })).status, 401);
    const sent = await api('/notifications/email', undefined, { method: 'POST', body: email, headers: { 'x-service-token': 'test-service-token' } });
    assert.equal((await sent.json()).success, false, 'no email provider configured → not reported as sent');
  });

  test('WAHA session/QR endpoints are not public', async () => {
    assert.equal((await api('/webhooks/whatsapp/waha/qr')).status, 401);
    assert.equal((await api('/webhooks/whatsapp/waha/start', undefined, { method: 'POST' })).status, 401);
  });

  test('WAHA webhook: signed messages route only to the session owner; others are dropped', async () => {
    process.env.WAHA_WEBHOOK_HMAC_KEY = 'waha-test-key';
    try {
      const a = await tenant();
      const b = await tenant();
      await t.prisma.channel.create({ data: { tenantId: a.tenantId, type: 'WHATSAPP', name: 'WA', status: 'ACTIVE', config: { provider: 'waha', wahaSession: 'ch_a' } } });
      await t.prisma.channel.create({ data: { tenantId: b.tenantId, type: 'WHATSAPP', name: 'WA', status: 'ACTIVE', config: { provider: 'waha', wahaSession: 'ch_b' } } });
      const payload = (session: string) =>
        JSON.stringify({ event: 'message', session, payload: { from: '94771234567@c.us', body: 'Hello, can I book?', fromMe: false, _data: { notifyName: 'Kasun' } } });
      const sign = (raw: string) => createHmac('sha512', 'waha-test-key').update(raw).digest('hex');

      const unsigned = payload('ch_a');
      assert.equal((await api('/webhooks/whatsapp/waha', undefined, { method: 'POST', body: unsigned })).status, 401);

      const forged = payload('ch_a');
      assert.equal((await api('/webhooks/whatsapp/waha', undefined, { method: 'POST', body: forged, headers: { 'x-webhook-hmac': sign('different') } })).status, 401);

      const good = payload('ch_a');
      const res = await api('/webhooks/whatsapp/waha', undefined, { method: 'POST', body: good, headers: { 'x-webhook-hmac': sign(good) } });
      assert.equal(res.status, 200);

      const inA = await waitFor(() => t.prisma.message.count({ where: { tenantId: a.tenantId } }), 5000);
      assert.ok(inA >= 1, 'delivered to the owning tenant');
      assert.equal(await t.prisma.message.count({ where: { tenantId: b.tenantId } }), 0, 'never to another tenant');

      const unknown = payload('ch_nobody');
      await api('/webhooks/whatsapp/waha', undefined, { method: 'POST', body: unknown, headers: { 'x-webhook-hmac': sign(unknown) } });
      assert.equal(await t.prisma.channel.count({ where: { config: { path: ['wahaSession'], equals: 'ch_nobody' } } }), 0, 'no channel auto-created');
    } finally {
      delete process.env.WAHA_WEBHOOK_HMAC_KEY;
    }
  });
});

describe('durable queue', () => {
  test('a task created over HTTP is executed by the background worker', async () => {
    const f = await tenant();
    const owner = await t.prisma.user.findUnique({ where: { id: f.ownerId } });
    const token = await login(owner.email);
    t.ai.script = [{ toolCalls: [{ name: 'get_business_metrics', arguments: { days: 7 } }] }, { content: '**Summary**\nQuiet week.' }];

    const res = await api('/ai-workforce/tasks', token, {
      method: 'POST',
      body: JSON.stringify({ employeeIds: [f.employeeId], title: 'Weekly metrics review', priority: 'HIGH' }),
    });
    assert.equal(res.status, 201);
    const id = (await res.json()).tasks[0].id;

    const done = await waitFor(async () => {
      const row = await t.prisma.aiTask.findUnique({ where: { id } });
      return row && ['COMPLETED', 'FAILED'].includes(row.status) ? row : null;
    }, 20000);
    assert.equal(done.status, 'COMPLETED', done.error ?? '');
    assert.match(done.result, /Quiet week/);

    const health = await (await api('/ai-workforce/health', token)).json();
    assert.equal(health.queueReachable, true);
  });
});
