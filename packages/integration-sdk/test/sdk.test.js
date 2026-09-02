const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// Import from built dist
const {
  registerAction,
  unregisterAction,
  clearRegisteredActions,
  getRegisteredActions,
  getRegisteredAction,
  registerKnowledge,
  clearRegisteredKnowledge,
  resolveKnowledgeResponse,
  listRegisteredActionsResponse,
  executeRegisteredAction,
  checkAuth,
  handleIntegrationRequest,
  validateActionData,
  MemoryIdempotencyStore,
  createExpressRouter,
  AiActionsController,
  AiActionsModule,
} = require('../dist/index.js');

describe('ai-employee-integration-sdk', () => {
  beforeEach(() => {
    clearRegisteredActions();
    clearRegisteredKnowledge();
  });

  describe('Action Registry & Execution', () => {
    test('registers action and lists schemas correctly', () => {
      registerAction({
        name: 'test_action',
        description: 'Test action description',
        parameters: {
          param1: { type: 'string', required: true, description: 'A test string' },
          count: { type: 'number', required: false, description: 'A test count' },
        },
        handler: async (data) => ({ received: data }),
      });

      const actions = getRegisteredActions();
      assert.equal(actions.length, 1);
      assert.equal(actions[0].name, 'test_action');

      const actionList = listRegisteredActionsResponse();
      assert.equal(actionList.actions.length, 1);
      assert.equal(actionList.actions[0].name, 'test_action');
      assert.equal(actionList.actions[0].description, 'Test action description');
      assert.equal(actionList.actions[0].parameters.param1.required, true);
    });

    test('validates missing required parameter', async () => {
      registerAction({
        name: 'book_appointment',
        description: 'Book an appointment',
        parameters: {
          customerName: { type: 'string', required: true },
          serviceId: { type: 'string', required: true },
        },
        handler: async (data) => ({ id: '123', ...data }),
      });

      // Missing customerName
      const res1 = await executeRegisteredAction('book_appointment', { serviceId: 'srv_1' });
      assert.equal(res1.success, false);
      assert.match(res1.message, /Missing required parameter "customerName"/);

      // Missing serviceId
      const res2 = await executeRegisteredAction('book_appointment', { customerName: 'Alice' });
      assert.equal(res2.success, false);
      assert.match(res2.message, /Missing required parameter "serviceId"/);
    });

    test('validates parameter types', async () => {
      registerAction({
        name: 'test_types',
        description: 'Type checking test',
        parameters: {
          str: { type: 'string', required: false },
          num: { type: 'number', required: false },
          bool: { type: 'boolean', required: false },
          arr: { type: 'array', required: false },
          obj: { type: 'object', required: false },
          dt: { type: 'date', required: false },
        },
        handler: async (data) => data,
      });

      // Invalid number
      const resNum = await executeRegisteredAction('test_types', { num: 'not-a-number' });
      assert.equal(resNum.success, false);
      assert.match(resNum.message, /must be a valid number/);

      // Invalid boolean
      const resBool = await executeRegisteredAction('test_types', { bool: 'true' });
      assert.equal(resBool.success, false);
      assert.match(resBool.message, /must be a boolean/);

      // Invalid array
      const resArr = await executeRegisteredAction('test_types', { arr: 'item1,item2' });
      assert.equal(resArr.success, false);
      assert.match(resArr.message, /must be an array/);

      // Invalid date
      const resDt = await executeRegisteredAction('test_types', { dt: 'invalid-date-string' });
      assert.equal(resDt.success, false);
      assert.match(resDt.message, /must be a valid ISO date/);

      // Valid types
      const resValid = await executeRegisteredAction('test_types', {
        str: 'hello',
        num: 42,
        bool: true,
        arr: [1, 2],
        obj: { a: 1 },
        dt: '2026-09-02T10:00:00Z',
      });
      assert.equal(resValid.success, true);
      assert.equal(resValid.data.num, 42);
    });

    test('executes action successfully and passes context', async () => {
      let passedContext;
      registerAction({
        name: 'echo_with_ctx',
        description: 'Echoes with context',
        parameters: { text: { type: 'string', required: true } },
        handler: async (data, ctx) => {
          passedContext = ctx;
          return { echo: data.text, key: ctx?.idempotencyKey };
        },
      });

      const res = await executeRegisteredAction(
        'echo_with_ctx',
        { text: 'Hello AI' },
        { idempotencyKey: 'key_123' },
      );

      assert.equal(res.success, true);
      assert.equal(res.data.echo, 'Hello AI');
      assert.equal(res.data.key, 'key_123');
      assert.equal(passedContext?.idempotencyKey, 'key_123');
    });

    test('returns unknown action failure gracefully', async () => {
      const res = await executeRegisteredAction('non_existent_action', {});
      assert.equal(res.success, false);
      assert.match(res.message, /Unknown action/);
    });

    test('catches errors thrown in handler without crashing', async () => {
      registerAction({
        name: 'failing_action',
        description: 'Always fails',
        parameters: {},
        handler: async () => {
          throw new Error('Database connection timed out');
        },
      });

      const res = await executeRegisteredAction('failing_action', {});
      assert.equal(res.success, false);
      assert.match(res.message, /Database connection timed out/);
    });
  });

  describe('Knowledge Feed Provider', () => {
    test('returns empty lists when no provider is registered', async () => {
      const feed = await resolveKnowledgeResponse();
      assert.deepEqual(feed, { documents: [], locations: [] });
    });

    test('returns documents when provider returns array', async () => {
      registerKnowledge(async () => [
        { externalId: 'doc1', title: 'Services', content: 'Our service menu' },
      ]);

      const feed = await resolveKnowledgeResponse();
      assert.equal(feed.documents.length, 1);
      assert.equal(feed.documents[0].externalId, 'doc1');
      assert.deepEqual(feed.locations, []);
    });

    test('returns documents and locations when provider returns KnowledgeFeed object', async () => {
      registerKnowledge(async () => ({
        documents: [{ externalId: 'pricing', title: 'Pricing', content: '$50 per hour' }],
        locations: [
          {
            externalId: 'loc_downtown',
            name: 'Downtown Branch',
            address: '123 Main St',
            timezone: 'America/New_York',
          },
        ],
      }));

      const feed = await resolveKnowledgeResponse();
      assert.equal(feed.documents.length, 1);
      assert.equal(feed.locations.length, 1);
      assert.equal(feed.locations[0].name, 'Downtown Branch');
    });
  });

  describe('Idempotency Store', () => {
    test('stores, retrieves, and clears cached responses', () => {
      const store = new MemoryIdempotencyStore({ defaultTtlSeconds: 60 });
      const sample = { success: true, message: 'Done', data: { orderId: 999 } };

      assert.equal(store.get('req_1'), undefined);

      store.set('req_1', sample);
      const cached = store.get('req_1');
      assert.deepEqual(cached, sample);

      store.delete('req_1');
      assert.equal(store.get('req_1'), undefined);
    });

    test('expires items after TTL', async () => {
      const store = new MemoryIdempotencyStore({ defaultTtlSeconds: 0.05 }); // 50ms TTL
      store.set('req_fast', { success: true, message: 'Fast' });

      assert.ok(store.get('req_fast'));

      await new Promise((resolve) => setTimeout(resolve, 60));
      assert.equal(store.get('req_fast'), undefined);
    });
  });

  describe('Authentication Checker', () => {
    test('verifies API key authentication', async () => {
      const options = { apiKey: 'secret-key-123', apiKeyHeader: 'x-api-key' };

      // Valid key
      assert.equal(await checkAuth(options, { headers: { 'x-api-key': 'secret-key-123' } }), true);

      // Invalid key
      assert.equal(await checkAuth(options, { headers: { 'x-api-key': 'wrong-key' } }), false);

      // Missing header
      assert.equal(await checkAuth(options, { headers: {} }), false);
    });

    test('verifies Bearer token authentication', async () => {
      const options = { bearerToken: 'my-jwt-token' };

      assert.equal(
        await checkAuth(options, { headers: { authorization: 'Bearer my-jwt-token' } }),
        true,
      );

      assert.equal(
        await checkAuth(options, { headers: { authorization: 'Bearer wrong-token' } }),
        false,
      );
    });

    test('supports custom verifyAuth function', async () => {
      const options = {
        verifyAuth: (req) => req.headers['x-custom-sig'] === 'valid_signature',
      };

      assert.equal(
        await checkAuth(options, { headers: { 'x-custom-sig': 'valid_signature' } }),
        true,
      );
      assert.equal(
        await checkAuth(options, { headers: { 'x-custom-sig': 'invalid' } }),
        false,
      );
    });
  });

  describe('Standalone / Framework-Agnostic Dispatcher', () => {
    test('routes GET /ai/actions', async () => {
      registerAction({
        name: 'list_items',
        description: 'List items',
        parameters: {},
        handler: async () => [],
      });

      const res = await handleIntegrationRequest({
        method: 'GET',
        path: '/ai/actions',
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.actions.length, 1);
      assert.equal(res.body.actions[0].name, 'list_items');
    });

    test('routes POST /ai/execute and rejects unauthenticated requests', async () => {
      registerAction({
        name: 'protected_action',
        description: 'Protected',
        parameters: { val: { type: 'string', required: true } },
        handler: async (d) => ({ echoed: d.val }),
      });

      const authOptions = { apiKey: 'safe_key' };

      // Unauthorized call
      const unauth = await handleIntegrationRequest(
        {
          method: 'POST',
          path: '/ai/execute',
          headers: { 'x-api-key': 'wrong' },
          body: { action: 'protected_action', data: { val: 'test' } },
        },
        authOptions,
      );
      assert.equal(unauth.status, 401);

      // Authorized call
      const authed = await handleIntegrationRequest(
        {
          method: 'POST',
          path: '/ai/execute',
          headers: { 'x-api-key': 'safe_key' },
          body: { action: 'protected_action', data: { val: 'test' } },
        },
        authOptions,
      );
      assert.equal(authed.status, 200);
      assert.equal(authed.body.success, true);
      assert.equal(authed.body.data.echoed, 'test');
    });
  });

  describe('Express & NestJS Adapters', () => {
    test('createExpressRouter returns an express router instance', () => {
      const router = createExpressRouter({ apiKey: 'key_123' });
      assert.ok(router);
      assert.equal(typeof router, 'function'); // Express Router is a callable function
    });

    test('AiActionsModule and AiActionsController instantiate properly', () => {
      const dynamicModule = AiActionsModule.forRoot({ apiKey: 'key_123' });
      assert.ok(dynamicModule.module);
      assert.equal(dynamicModule.controllers[0], AiActionsController);

      const controller = new AiActionsController({ apiKey: 'key_123' });
      assert.ok(controller);
      assert.equal(typeof controller.listActions, 'function');
      assert.equal(typeof controller.execute, 'function');
      assert.equal(typeof controller.listKnowledge, 'function');
    });
  });
});
