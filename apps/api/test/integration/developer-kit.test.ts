import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { bootApp, configureTestEnv, createTenant, deleteTenant, waitFor, type TenantFixture, type TestApp } from './harness';

configureTestEnv();

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: TestApp;
let f: TenantFixture;
let integrations: any;
let base = '';
let devServer: Server | undefined;
const SDK = '../../../../packages/integration-sdk/dist';

before(async () => {
  t = await bootApp();
  await t.app.listen(0);
  base = `http://127.0.0.1:${t.app.getHttpServer().address().port}`;
  process.env.API_URL = base; // webhook URLs in the kit point at this test server
  const { IntegrationService } = await import('../../src/modules/integration/integration.service');
  integrations = t.get(IntegrationService);
  f = await createTenant(t.prisma);
});

after(async () => {
  devServer?.close();
  await deleteTenant(t.prisma, f);
  await t.close();
});

/** What a developer builds from the kit with the SDK: one action, keys from the kit. */
async function developerBuilds(apiKey: string, samePort = false): Promise<string> {
  const express = require(`${SDK}/../node_modules/express`);
  const sdk = require(`${SDK}/express-adapter.js`);
  const registry = require(`${SDK}/registry.js`);
  registry.clearRegisteredActions();
  registry.registerAction({
    name: 'find_order',
    description: 'Look up an order by number',
    parameters: { orderNumber: { type: 'string', required: true, description: 'Order number' } },
    handler: async (d: { orderNumber: string }) => ({ orderNumber: d.orderNumber, status: 'SHIPPED' }),
  });
  const app = express();
  app.use(express.json());
  app.use('/ai', sdk.createExpressRouter({ apiKey }));
  const port = samePort && devServer ? (devServer.address() as any).port : 0;
  if (devServer) await new Promise((r) => devServer!.close(r));
  devServer = await new Promise<Server>((r) => {
    const s = app.listen(port, () => r(s));
  });
  return `http://127.0.0.1:${(devServer.address() as any).port}`;
}

test('owner flow: developer kit → developer builds with the SDK → owner tests → events arrive', async () => {
  const kit = await integrations.createDeveloperKit(f.tenantId, 'Shop backend');
  assert.match(kit.apiKey, /^aie_[A-Za-z0-9_-]{32}$/);
  assert.equal(kit.webhookUrl, `${base}/webhooks/${kit.integration.id}`);
  assert.ok(kit.webhookSecret.length >= 32);

  // Before the developer is done there is nothing to test yet.
  const early = await integrations.testConnection(f.tenantId, kit.integration.id);
  assert.equal(early.ok, false);
  assert.match(early.message, /Base URL/);

  const devUrl = await developerBuilds(kit.apiKey);
  await integrations.update(f.tenantId, kit.integration.id, { baseUrl: devUrl });
  const result = await integrations.testConnection(f.tenantId, kit.integration.id);
  assert.equal(result.ok, true, result.message);
  assert.equal(result.actions, 1);

  const order = await integrations.execute(f.tenantId, kit.integration.id, 'find_order', { orderNumber: 'A-1' });
  assert.equal(order.success, true);
  assert.equal(order.data.status, 'SHIPPED');

  // The developer's software reports an event with the kit's webhook details.
  const { sendEvent } = require(`${SDK}/events.js`);
  const sent = await sendEvent('order.shipped', { orderNumber: 'A-1' }, { webhookUrl: kit.webhookUrl, webhookSecret: kit.webhookSecret });
  assert.equal(sent.ok, true, sent.error);
  const health = await waitFor(async () => {
    const row = await integrations.getForApi(f.tenantId, kit.integration.id);
    return row.lastEventType ? row : null;
  });
  assert.equal(health.lastEventType, 'order.shipped');
  assert.equal(health.actionsCount, 1);
});

test('a lost kit is replaced: new keys work, the old ones stop at once', async () => {
  const kit = await integrations.createDeveloperKit(f.tenantId, 'Booking app');
  const devUrl = await developerBuilds(kit.apiKey);
  await integrations.update(f.tenantId, kit.integration.id, { baseUrl: devUrl });
  assert.equal((await integrations.testConnection(f.tenantId, kit.integration.id)).ok, true);

  const renewed = await integrations.renewDeveloperKit(f.tenantId, kit.integration.id);
  assert.notEqual(renewed.apiKey, kit.apiKey);

  // The developer's server still has the old key, so AI Employee is refused…
  const stale = await integrations.testConnection(f.tenantId, kit.integration.id);
  assert.equal(stale.ok, false);
  assert.match(stale.message, /rejected the API key/);
  // …and an event signed with the old secret is refused too.
  const { sendEvent } = require(`${SDK}/events.js`);
  const old = await sendEvent('order.shipped', {}, { webhookUrl: kit.webhookUrl, webhookSecret: kit.webhookSecret, retries: 0 });
  assert.equal(old.ok, false);

  // Developer updates to the new keys: everything works again.
  await developerBuilds(renewed.apiKey, true); // same server address, new key
  const again = await integrations.testConnection(f.tenantId, kit.integration.id);
  assert.equal(again.ok, true, again.message);
  const fresh = await sendEvent('order.shipped', {}, { webhookUrl: renewed.webhookUrl, webhookSecret: renewed.webhookSecret });
  assert.equal(fresh.ok, true, fresh.error);
});

test('a kit needs a name', async () => {
  await assert.rejects(() => integrations.createDeveloperKit(f.tenantId, '  '), /name/);
});
