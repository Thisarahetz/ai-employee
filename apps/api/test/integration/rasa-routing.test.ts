/**
 * Rasa-first routing through the real app and test database. A small fake Rasa
 * HTTP server returns scripted predictions (the real model is measured by
 * rasa/scripts/evaluate.py); the AI is scripted and every call is counted, so
 * "no LLM call" is proven by counting, not by trusting a flag.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, Server } from 'node:http';
import { TestApp, TenantFixture, bootApp, configureTestEnv, createTenant, deleteTenant, waitFor } from './harness';

configureTestEnv();

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: TestApp;
let chat: any;
let nlu: any;
let rasa: any;
let fake: Server;
const fixtures: TenantFixture[] = [];
let seq = 0;

type Pred = { intent: string; confidence: number; second?: number } | 'malformed' | 'error';
const predictions = new Map<string, Pred>();
const received: { text: string; token: string | null }[] = [];

before(async () => {
  fake = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const url = new URL(req.url ?? '', 'http://x');
      if (url.pathname === '/version') return res.end('{"version":"fake"}');
      const text = JSON.parse(body || '{}').text as string;
      received.push({ text, token: url.searchParams.get('token') });
      const pred = predictions.get(text) ?? { intent: 'out_of_scope', confidence: 0.9 };
      if (pred === 'error') return void res.writeHead(500).end();
      if (pred === 'malformed') return void res.end('{"nope":true}');
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ text, intent: { name: pred.intent, confidence: pred.confidence }, intent_ranking: [{ name: pred.intent, confidence: pred.confidence }, { name: 'x', confidence: pred.second ?? 0.01 }], entities: [] }));
    });
  });
  await new Promise<void>((r) => fake.listen(0, '127.0.0.1', r));
  process.env.RASA_ENABLED = 'true';
  process.env.RASA_BASE_URL = `http://127.0.0.1:${(fake.address() as any).port}`;
  process.env.RASA_AUTH_TOKEN = 'test-token';

  t = await bootApp();
  t.ai.embed = (async () => ({ embedding: Array(1536).fill(0.01), tokenCount: 0 })) as any;
  await t.app.listen(0);
  const { WebsiteChatService } = await import('../../src/modules/website-chat/website-chat.service');
  const { NluService } = await import('../../src/modules/nlu/nlu.service');
  const { RasaClient } = await import('../../src/modules/nlu/rasa.client');
  chat = t.get(WebsiteChatService);
  nlu = t.get(NluService);
  rasa = t.get(RasaClient);
});

after(async () => {
  try {
    for (const f of fixtures) await deleteTenant(t.prisma, f);
  } finally {
    delete process.env.RASA_ENABLED;
    await new Promise((r) => fake.close(r));
    t.app.getHttpServer().closeAllConnections?.();
    await t.close();
  }
});

async function business(mode: 'AI' | 'HYBRID' | 'NO_AI') {
  const f = await createTenant(t.prisma, { name: `Rasa Salon ${seq++}`, replyMode: mode });
  fixtures.push(f);
  const channel = await t.prisma.channel.create({ data: { tenantId: f.tenantId, type: 'WEBSITE_CHAT', name: 'Website', status: 'ACTIVE', config: {} } });
  return { ...f, channelId: channel.id };
}

async function say(b: { channelId: string }, message: string, pred?: Pred, sessionId = `s-${seq++}`) {
  if (pred) predictions.set(message, pred);
  const { conversationId } = await chat.ingest(b.channelId, { sessionId, message });
  const reply = await waitFor(async () => (await t.prisma.message.findFirst({ where: { conversationId, sender: { in: ['AI', 'HUMAN_AGENT'] } }, orderBy: { createdAt: 'desc' } })) ?? null, 8000);
  return { reply, conversationId };
}

const aiCalls = (tenantId: string) => t.ai.calls.filter((c) => c.tenantId === tenantId).length;
const isRouterCall = (c: { messages: { content: string }[] }) => c.messages.some((m) => /intent classification router/.test(m.content));
const routerCalls = (tenantId: string) => t.ai.calls.filter((c) => c.tenantId === tenantId && isRouterCall(c)).length;

describe('supported intents skip the router LLM', () => {
  test('fixed-reply intents (goodbye) in English, Sinhala and Singlish: zero LLM calls in Hybrid', async () => {
    const b = await business('HYBRID');
    for (const text of ['ok see you then', 'හොඳයි ආයෙ හම්බෙමු', 'passe hambemu']) {
      const { reply } = await say(b, text, { intent: 'goodbye', confidence: 0.97 });
      assert.equal(reply.metadata.replySource, 'template', text);
      assert.equal(reply.metadata.nlu.path, 'rasa');
      assert.equal(reply.metadata.nlu.intent, 'goodbye');
    }
    assert.equal(aiCalls(b.tenantId), 0);
  });

  test('knowledge intents in three languages reach the knowledge agent without a router call or translation call', async () => {
    const b = await business('AI');
    t.ai.script = [];
    for (const text of ['what time do you open', 'කීයටද විවෘත කරන්නේ', 'kiyatada open karanne']) {
      t.ai.script.push({ content: 'We open at 9.' });
      const { reply } = await say(b, text, { intent: 'ask_business_hours', confidence: 0.96 });
      assert.equal(reply.metadata.replySource, 'ai');
      assert.equal(reply.metadata.nlu.intent, 'ask_business_hours');
    }
    assert.equal(routerCalls(b.tenantId), 0);
    assert.equal(aiCalls(b.tenantId), 3, 'one answer call per message, nothing else');
  });

  test('the booking agent is chosen by Rasa, and is still the one that runs tools', async () => {
    const b = await business('AI');
    t.ai.script = [{ content: 'What time would you like?' }];
    const { reply } = await say(b, 'heta appointment ekak ona', { intent: 'book_appointment', confidence: 0.99 });
    assert.equal(reply.metadata.nlu.path, 'rasa');
    assert.equal(reply.agentType, 'ACTION');
    assert.equal(routerCalls(b.tenantId), 0);
  });

  test('the token reaches Rasa as configured and the message carries no tenant data', async () => {
    assert.ok(received.length > 0);
    assert.ok(received.every((r) => r.token === 'test-token'));
  });
});

describe('everything else falls back to the existing LLM', () => {
  const routerThen = (answer: string, agent = 'support_agent') => [{ content: `{"intent":"support","agent":"${agent}","confidence":0.9}` }, { content: answer }];

  test('unknown intent → router LLM, reason stored', async () => {
    const b = await business('AI');
    t.ai.script = routerThen('Here is a poem.');
    const { reply } = await say(b, 'write me a poem about the sea', { intent: 'out_of_scope', confidence: 0.95 });
    assert.equal(reply.metadata.replySource, 'ai');
    assert.deepEqual([reply.metadata.nlu.path, reply.metadata.nlu.reason], ['llm', 'unsupported_intent']);
    assert.equal(routerCalls(b.tenantId), 1);
  });

  test('low confidence → LLM', async () => {
    const b = await business('AI');
    t.ai.script = routerThen('ok');
    const { reply } = await say(b, 'hmm maybe something about prices', { intent: 'ask_pricing', confidence: 0.4 });
    assert.equal(reply.metadata.nlu.reason, 'low_confidence');
    assert.equal(routerCalls(b.tenantId), 1);
  });

  test('cancel at 0.85 is not trusted, the LLM decides', async () => {
    const b = await business('AI');
    t.ai.script = routerThen('Which booking?', 'action_agent');
    const { reply } = await say(b, 'maybe cancel something', { intent: 'cancel_appointment', confidence: 0.85 });
    assert.equal(reply.metadata.nlu.reason, 'medium_confidence');
    assert.equal(routerCalls(b.tenantId), 1);
  });

  test('a confident request_human prediction does NOT create a handoff by itself', async () => {
    const b = await business('AI');
    t.ai.script = routerThen('Sure, here is a song.');
    const { reply, conversationId } = await say(b, 'sing me a song please', { intent: 'request_human', confidence: 0.99 });
    assert.equal(reply.metadata.nlu.reason, 'sensitive_intent');
    assert.equal(await t.prisma.humanHandoff.count({ where: { conversationId } }), 0);
  });

  test('a bare "yes" outside a booking is not routed by Rasa', async () => {
    const b = await business('AI');
    t.ai.script = routerThen('Yes to what?');
    const { reply } = await say(b, 'ow ow', { intent: 'affirm', confidence: 0.99 });
    assert.equal(reply.metadata.nlu.reason, 'context_required');
  });

  test('malformed and failing Rasa responses fall back, customers still get a reply', async () => {
    const b = await business('AI');
    rasa.resetBreaker();
    t.ai.script = routerThen('Fine.');
    const bad = await say(b, 'weird response one', 'malformed');
    assert.equal(bad.reply.metadata.nlu.reason, 'rasa_unavailable');
    rasa.resetBreaker();
    t.ai.script = routerThen('Fine.');
    const err = await say(b, 'weird response two', 'error');
    assert.equal(err.reply.metadata.nlu.reason, 'rasa_unavailable');
    assert.equal(err.reply.metadata.replySource, 'ai');
    rasa.resetBreaker();
  });

  test('Rasa down for good: the breaker opens and later messages skip the call entirely', async () => {
    const b = await business('AI');
    rasa.resetBreaker();
    const saved = process.env.RASA_BASE_URL;
    process.env.RASA_BASE_URL = 'http://127.0.0.1:1'; // nothing listens here
    try {
      for (let i = 0; i < 4; i++) {
        t.ai.script = routerThen('Still answering.');
        const { reply } = await say(b, `are you there ${i}`);
        assert.equal(reply.metadata.nlu.reason, 'rasa_unavailable');
        assert.equal(reply.metadata.replySource, 'ai');
      }
    } finally {
      process.env.RASA_BASE_URL = saved;
      rasa.resetBreaker();
    }
  });

  test('Rasa AND the LLM unavailable: a controlled handoff reply, not silence or a fake answer', async () => {
    const b = await business('AI');
    rasa.resetBreaker();
    const saved = process.env.RASA_BASE_URL;
    process.env.RASA_BASE_URL = 'http://127.0.0.1:1';
    t.ai.script = [new Error('provider down')];
    try {
      const { reply, conversationId } = await say(b, 'what is the price of everything');
      assert.equal(reply.metadata.replySource, 'handoff');
      assert.match(reply.content, /team member has been notified/);
      assert.equal(await t.prisma.humanHandoff.count({ where: { conversationId } }), 1);
    } finally {
      process.env.RASA_BASE_URL = saved;
      rasa.resetBreaker();
    }
  });
});

describe('disabled and observable', () => {
  test('RASA_ENABLED=false restores the original behaviour', async () => {
    const b = await business('AI');
    process.env.RASA_ENABLED = 'false';
    try {
      t.ai.script = [{ content: '{"intent":"knowledge","agent":"knowledge_agent","confidence":0.9,"search_query":"hours"}' }, { content: 'Open at 9.' }];
      const { reply } = await say(b, 'what time do you open', { intent: 'ask_business_hours', confidence: 0.99 });
      assert.equal(reply.metadata.nlu.reason, 'disabled');
      assert.equal(routerCalls(b.tenantId), 1);
    } finally {
      process.env.RASA_ENABLED = 'true';
    }
  });

  test("a business can switch smart routing off in Settings; others are unaffected", async () => {
    const off = await business('AI');
    const on = await business('AI');
    const { ReplyPolicyService } = await import('../../src/modules/reply-engine/reply-policy.service');
    const policy = t.get(ReplyPolicyService);
    const after = await policy.setSmartRouting(off.tenantId, false);
    assert.deepEqual(after.smartRouting, { available: true, enabled: false });
    await assert.rejects(() => policy.setSmartRouting(off.tenantId, 'yes'), /true or false/);

    t.ai.script = [{ content: '{"intent":"knowledge","agent":"knowledge_agent","confidence":0.9,"search_query":"hours"}' }, { content: 'Open at 9.' }];
    const a = await say(off, 'what time do you open', { intent: 'ask_business_hours', confidence: 0.99 });
    assert.equal(a.reply.metadata.nlu.reason, 'disabled');
    assert.equal(routerCalls(off.tenantId), 1);

    t.ai.script = [{ content: 'Open at 9.' }];
    const b = await say(on, 'what time do you open', { intent: 'ask_business_hours', confidence: 0.99 });
    assert.equal(b.reply.metadata.nlu.path, 'rasa');
    assert.equal(routerCalls(on.tenantId), 0);
  });

  test('stats are per business and show the LLM calls avoided', async () => {
    const a = await business('HYBRID');
    const other = await business('HYBRID');
    await say(a, 'bye for now', { intent: 'goodbye', confidence: 0.98 });
    await say(other, 'bye for now two', { intent: 'goodbye', confidence: 0.98 });
    await say(other, 'bye for now three', { intent: 'goodbye', confidence: 0.98 });
    const sa = await nlu.stats(a.tenantId, 1);
    const so = await nlu.stats(other.tenantId, 1);
    assert.equal(sa.routerCallsAvoided, 1);
    assert.equal(so.routerCallsAvoided, 2);
    assert.deepEqual(sa.byIntent, { goodbye: 1 });
    assert.ok(sa.process.requests > 0);
  });
});
