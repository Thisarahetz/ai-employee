/**
 * A phone call through the real app and test database: Twilio's webhook, the
 * ConversationRelay WebSocket, Rasa (a scripted fake), the scripted AI fallback,
 * handoff and transfer. Only Twilio and the AI model are stand-ins.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, Server } from 'node:http';
import { WebSocket } from 'ws';
import { TestApp, TenantFixture, bootApp, configureTestEnv, createTenant, deleteTenant, waitFor } from './harness';
import { twilioSignature } from '../../src/modules/voice/twilio-signature';

configureTestEnv();

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: TestApp;
let fake: Server;
let port: number;
const fixtures: TenantFixture[] = [];
const TOKEN = 'twilio-test-auth-token';
const API = 'http://voice.test';
let seq = 0;

const predictions = new Map<string, { intent: string; confidence: number }>();

before(async () => {
  fake = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (new URL(req.url ?? '', 'http://x').pathname === '/version') return res.end('{"version":"fake"}');
      const text = JSON.parse(body || '{}').text as string;
      const p = predictions.get(text) ?? { intent: 'out_of_scope', confidence: 0.9 };
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ text, intent: { name: p.intent, confidence: p.confidence }, intent_ranking: [{ name: p.intent, confidence: p.confidence }, { name: 'x', confidence: 0.01 }], entities: [] }));
    });
  });
  await new Promise<void>((r) => fake.listen(0, '127.0.0.1', r));
  Object.assign(process.env, {
    RASA_ENABLED: 'true',
    RASA_BASE_URL: `http://127.0.0.1:${(fake.address() as any).port}`,
    RASA_AUTH_TOKEN: 'test-token',
    API_URL: API,
    TWILIO_AUTH_TOKEN: TOKEN,
    WEBHOOK_SIGNING_SECRET: 'voice-test-signing-secret-0123456789',
    VOICE_REPLY_TIMEOUT_MS: '600',
    VOICE_HANDOFF_END_DELAY_MS: '50',
  });
  t = await bootApp();
  t.ai.embed = (async () => ({ embedding: Array(1536).fill(0.01), tokenCount: 0 })) as any;
  await t.app.listen(0);
  port = t.app.getHttpServer().address().port;
});

after(async () => {
  try {
    for (const f of fixtures) await deleteTenant(t.prisma, f);
  } finally {
    for (const k of ['RASA_ENABLED', 'TWILIO_AUTH_TOKEN', 'API_URL', 'VOICE_REPLY_TIMEOUT_MS', 'VOICE_HANDOFF_END_DELAY_MS']) delete process.env[k];
    await new Promise((r) => fake.close(r));
    t.app.getHttpServer().closeAllConnections?.();
    await t.close();
  }
});

async function line(config: Record<string, unknown> = {}, tenantOpts: Record<string, unknown> = {}) {
  const f = await createTenant(t.prisma, { name: `Voice Salon ${seq++}`, replyMode: 'AI', ...tenantOpts });
  fixtures.push(f);
  const channel = await t.prisma.channel.create({ data: { tenantId: f.tenantId, type: 'VOICE', name: 'Phone', status: 'ACTIVE', config } });
  return { ...f, channelId: channel.id };
}

async function post(path: string, params: Record<string, string>, signed = true) {
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' };
  if (signed) headers['x-twilio-signature'] = twilioSignature(`${API}${path}`, params, TOKEN);
  return fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers, body: new URLSearchParams(params).toString() });
}

/** The webhook, then the socket, like Twilio does it. */
async function call(channelId: string, from = `+9477${String(1000000 + seq++).slice(0, 7)}`) {
  const res = await post(`/webhooks/voice/twilio/incoming/${channelId}`, { CallSid: `CA${seq++}`, From: from, To: '+94112223333' });
  const twiml = await res.text();
  const token = /name="token" value="([^"]+)"/.exec(twiml)?.[1] ?? '';
  const ws = new WebSocket(`ws://127.0.0.1:${port}/voice/stream`);
  const frames: any[] = [];
  let closed = false;
  ws.on('message', (d) => frames.push(JSON.parse(d.toString())));
  ws.on('close', () => (closed = true));
  await new Promise((r, j) => (ws.once('open', r), ws.once('error', j)));
  const c = {
    twiml,
    frames,
    from,
    get closed() { return closed; },
    setup: (tok = token) => ws.send(JSON.stringify({ type: 'setup', callSid: 'CAx', from, to: '+94112223333', customParameters: { token: tok } })),
    say: (text: string) => ws.send(JSON.stringify({ type: 'prompt', voicePrompt: text, lang: 'en-US', last: true })),
    next: (pred: (f: any) => boolean, ms = 8000) => waitFor(async () => frames.find(pred) ?? null, ms),
    hangup: () => ws.close(),
  };
  return c;
}

const router = (agent: string, confidence: number) => ({ content: `{"intent":"support","agent":"${agent}","confidence":${confidence}}` });
const isRouterCall = (c: { messages: { content: string }[] }) => c.messages.some((m) => /intent classification router/.test(m.content));

describe('the Twilio webhook', () => {
  test('a signed call gets TwiML that opens a stream with the business greeting', async () => {
    const b = await line();
    const res = await post(`/webhooks/voice/twilio/incoming/${b.channelId}`, { CallSid: 'CA1', From: '+94771234567' });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/xml/);
    const x = await res.text();
    assert.match(x, /<ConversationRelay /);
    assert.match(x, /url="ws:\/\/voice\.test\/voice\/stream"/);
    assert.match(x, /language="en-US"/);
    assert.match(x, /welcomeGreeting="Hello! Welcome to Voice Salon/);
    assert.match(x, new RegExp(`action="${API}/webhooks/voice/twilio/action/${b.channelId}"`));
  });

  test('an unsigned or wrongly signed request is refused', async () => {
    const b = await line();
    assert.equal((await post(`/webhooks/voice/twilio/incoming/${b.channelId}`, { CallSid: 'CA1' }, false)).status, 401);
    const bad = await fetch(`http://127.0.0.1:${port}/webhooks/voice/twilio/incoming/${b.channelId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': twilioSignature(`${API}/other`, {}, TOKEN) },
      body: 'CallSid=CA1',
    });
    assert.equal(bad.status, 401);
  });

  test('a channel that is not a voice channel is not found, and each tenant is checked with its own token', async () => {
    const f = await createTenant(t.prisma, { name: `Chat ${seq++}` });
    fixtures.push(f);
    const web = await t.prisma.channel.create({ data: { tenantId: f.tenantId, type: 'WEBSITE_CHAT', name: 'W', status: 'ACTIVE', config: {} } });
    assert.equal((await post(`/webhooks/voice/twilio/incoming/${web.id}`, {})).status, 404);

    const b = await line();
    const { ChannelService } = await import('../../src/modules/channel/channel.service');
    await t.get<any>(ChannelService).addCredential(b.tenantId, b.channelId, { type: 'BEARER_TOKEN', payload: { token: 'tenant-own-token' } });
    // The platform token no longer works for this channel; its own does.
    assert.equal((await post(`/webhooks/voice/twilio/incoming/${b.channelId}`, { CallSid: 'CA1' })).status, 401);
    const own = twilioSignature(`${API}/webhooks/voice/twilio/incoming/${b.channelId}`, { CallSid: 'CA1' }, 'tenant-own-token');
    const ok = await fetch(`http://127.0.0.1:${port}/webhooks/voice/twilio/incoming/${b.channelId}`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': own }, body: 'CallSid=CA1',
    });
    assert.equal(ok.status, 200);
  });

  test('a Sinhala business greets in Sinhala with a Sinhala speech language', async () => {
    const b = await line({}, {});
    await t.prisma.tenant.update({ where: { id: b.tenantId }, data: { defaultLanguage: 'si' } });
    const x = await (await post(`/webhooks/voice/twilio/incoming/${b.channelId}`, { CallSid: 'CA1' })).text();
    assert.match(x, /language="si-LK"/);
    assert.match(x, /ආයුබෝවන්/);
  });
});

describe('the call', () => {
  test('a known intent: Rasa picks the knowledge agent, no router LLM call, the answer is spoken', async () => {
    const b = await line();
    predictions.set('what time do you open', { intent: 'ask_business_hours', confidence: 0.97 });
    t.ai.script = [{ content: '**We open** at 9 AM 😊\n- Mon to Sat' }];
    const before = t.ai.calls.length;
    const c = await call(b.channelId);
    c.setup();
    c.say('what time do you open');
    const spoken = await c.next((f) => f.type === 'text');
    assert.equal(spoken.token, 'We open at 9 AM. Mon to Sat');
    assert.equal(spoken.last, true);
    const mine = t.ai.calls.slice(before).filter((x) => x.tenantId === b.tenantId);
    assert.equal(mine.filter(isRouterCall).length, 0);
    assert.match(JSON.stringify(mine[0]!.messages), /PHONE CALL/, 'the agent is told the reply is spoken');
    const msg = await t.prisma.message.findFirst({ where: { tenantId: b.tenantId, sender: 'AI' } });
    assert.equal(msg.metadata.nlu.intent, 'ask_business_hours');
    c.hangup();
  });

  test('low Rasa confidence falls back to the LLM router, whose answer is spoken', async () => {
    const b = await line();
    t.ai.script = [router('support_agent', 0.9), { content: 'We do hair and nails.' }];
    const before = t.ai.calls.length;
    const c = await call(b.channelId);
    c.setup();
    c.say('tell me about what you do');
    assert.equal((await c.next((f) => f.type === 'text')).token, 'We do hair and nails.');
    assert.equal(t.ai.calls.slice(before).filter((x) => x.tenantId === b.tenantId && isRouterCall(x)).length, 1);
    c.hangup();
  });

  test('speech the router cannot place is asked about once, then goes to a person', async () => {
    const b = await line({ transferNumber: '+94112345678' });
    t.ai.script = [router('support_agent', 0.1), router('support_agent', 0.1)];
    const c = await call(b.channelId);
    c.setup();
    c.say('mumble mumble');
    const ask = await c.next((f) => f.type === 'text');
    assert.match(ask.token, /didn't quite catch that/);
    assert.equal(c.frames.some((f) => f.type === 'end'), false);
    c.say('grumble grumble');
    const end = await c.next((f) => f.type === 'end');
    assert.equal(JSON.parse(end.handoffData).reason, 'handoff');
    assert.equal(await t.prisma.humanHandoff.count({ where: { tenantId: b.tenantId } }), 1);
    c.hangup();
  });

  test('asking for a person transfers the call when a number is configured', async () => {
    const b = await line({ transferNumber: '+94112345678' });
    const c = await call(b.channelId);
    c.setup();
    c.say('I want to talk to a real person please');
    const said = await c.next((f) => f.type === 'text');
    assert.match(said.token, /connected you with our team/);
    const end = await c.next((f) => f.type === 'end');
    const handoffData = end.handoffData;
    assert.equal(JSON.parse(handoffData).reason, 'handoff');
    assert.equal(t.ai.calls.filter((x) => x.tenantId === b.tenantId).length, 0, 'no AI call to hand off');

    const action = await post(`/webhooks/voice/twilio/action/${b.channelId}`, { HandoffData: handoffData, SessionStatus: 'ended', To: '+94112223333' });
    const x = await action.text();
    assert.match(x, /<Dial callerId="\+94112223333">\+94112345678<\/Dial>/);
    c.hangup();
  });

  test('with no transfer number the caller is told someone will call back, and the call just ends', async () => {
    const b = await line({});
    const c = await call(b.channelId);
    c.setup();
    c.say('I want to talk to a real person please');
    const said = await c.next((f) => f.type === 'text');
    assert.match(said.token, /someone will get back to you/);
    const end = await c.next((f) => f.type === 'end');
    assert.equal(JSON.parse(end.handoffData).reason, 'callback');
    const x = await (await post(`/webhooks/voice/twilio/action/${b.channelId}`, { HandoffData: end.handoffData, SessionStatus: 'ended' })).text();
    assert.match(x, /<Hangup\/>/);
    assert.ok(!x.includes('<Dial'));
    c.hangup();
  });

  test('a stream that failed goes to a person when there is a number, and is not forged by HandoffData alone', async () => {
    const b = await line({ transferNumber: '+94112345678' });
    const failed = await (await post(`/webhooks/voice/twilio/action/${b.channelId}`, { SessionStatus: 'failed' })).text();
    assert.match(failed, /<Dial/);
    const plain = await (await post(`/webhooks/voice/twilio/action/${b.channelId}`, { SessionStatus: 'ended' })).text();
    assert.match(plain, /<Hangup\/>/);
    assert.equal((await post(`/webhooks/voice/twilio/action/${b.channelId}`, { HandoffData: '{"reason":"handoff"}' }, false)).status, 401);
    const noNumber = await line({ transferNumber: 'not a number; <Hangup/>' });
    const x = await (await post(`/webhooks/voice/twilio/action/${noNumber.channelId}`, { HandoffData: '{"reason":"handoff"}' })).text();
    assert.ok(!x.includes('<Dial'));
  });

  test('a Sinhala caller is answered in Sinhala and the call switches to Sinhala speech first', async () => {
    const b = await line();
    predictions.set('ඔබ කීයටද විවෘත කරන්නේ', { intent: 'ask_business_hours', confidence: 0.96 });
    t.ai.script = [{ content: 'අපි උදේ 9ට විවෘත කරනවා.' }];
    const c = await call(b.channelId);
    c.setup();
    c.say('ඔබ කීයටද විවෘත කරන්නේ');
    const text = await c.next((f) => f.type === 'text');
    assert.equal(text.token, 'අපි උදේ 9ට විවෘත කරනවා.');
    const lang = c.frames.find((f) => f.type === 'language');
    assert.equal(lang.ttsLanguage, 'si-LK');
    assert.ok(c.frames.indexOf(lang) < c.frames.indexOf(text), 'language changes before the words');
    c.hangup();
  });

  test('a forged, missing or replayed-for-another-secret token gets no service', async () => {
    const b = await line();
    const forged = await call(b.channelId);
    forged.setup('Zm9yZ2Vk.Zm9yZ2Vk');
    await waitFor(async () => forged.closed, 3000);
    assert.equal(forged.frames.length, 0);
    assert.equal(await t.prisma.conversation.count({ where: { tenantId: b.tenantId } }), 0);

    const silent = await call(b.channelId);
    silent.say('hello without setup');
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(await t.prisma.conversation.count({ where: { tenantId: b.tenantId } }), 0, 'no setup, no conversation');
    silent.hangup();
  });

  test('when nothing answers in time the caller hears a notice, not silence', async () => {
    const b = await line();
    // The model never answers, so only the timer can speak.
    const original = t.ai.complete;
    t.ai.complete = (() => new Promise(() => undefined)) as any;
    try {
      const c = await call(b.channelId);
      c.setup();
      c.say('this will hang');
      const slow = await c.next((f) => f.type === 'text');
      assert.match(slow.token, /taking longer than expected/);
      c.hangup();
    } finally {
      t.ai.complete = original;
    }
  });

  test('hanging up closes the conversation, unless staff still have to act on it', async () => {
    const b = await line();
    t.ai.script = [router('support_agent', 0.9), { content: 'Sure.' }];
    const c = await call(b.channelId);
    c.setup();
    c.say('hello there friend');
    await c.next((f) => f.type === 'text');
    c.hangup();
    const closed = await waitFor(async () => (await t.prisma.conversation.findFirst({ where: { tenantId: b.tenantId, status: 'CLOSED' } })) ?? null, 5000);
    assert.ok(closed);

    const h = await line({});
    const c2 = await call(h.channelId);
    c2.setup();
    c2.say('please let me speak to a human');
    await c2.next((f) => f.type === 'end');
    c2.hangup();
    await new Promise((r) => setTimeout(r, 500));
    const kept = await t.prisma.conversation.findFirst({ where: { tenantId: h.tenantId } });
    assert.notEqual(kept.status, 'CLOSED', 'a pending handoff stays visible to staff');
  });
});
