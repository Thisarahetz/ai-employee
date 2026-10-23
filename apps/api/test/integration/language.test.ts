/**
 * Sinhala / Singlish customer handling through the real app: inbound website
 * chat → language detection → router → agents → reply, against the isolated
 * test database. The model is scripted, so these check what the system SENDS
 * the model (language instructions, English search query) and the fixed
 * messages it sends customers itself.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { TestApp, TenantFixture, bootApp, configureTestEnv, createTenant, deleteTenant, waitFor } from './harness';

configureTestEnv();

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: TestApp;
let f: TenantFixture;
let channelId: string;
let chat: any;
let seq = 0;
const embedded: string[] = [];

const SINHALA = /[඀-෿]/;
const systemOf = (messages: { role: string; content: string }[]) => messages.find((m) => m.role === 'system')?.content ?? '';

before(async () => {
  t = await bootApp();
  // Knowledge search needs embeddings; record which texts were embedded.
  t.ai.embed = (async (_tenantId: string, text: string) => {
    embedded.push(text);
    return { embedding: Array(1536).fill(0.01), tokenCount: 0 };
  }) as any;
  f = await createTenant(t.prisma, { name: 'Lanka Glow Salon' });
  const channel = await t.prisma.channel.create({
    data: { tenantId: f.tenantId, type: 'WEBSITE_CHAT', name: 'Website', status: 'ACTIVE', config: {} },
  });
  channelId = channel.id;
  const { WebsiteChatService } = await import('../../src/modules/website-chat/website-chat.service');
  chat = t.get(WebsiteChatService);
});

after(async () => {
  if (f) await deleteTenant(t.prisma, f);
  await t.close();
});

/** Sends one customer message and waits for the system's reply to it. */
async function say(message: string, sessionId = `s-${seq++}`) {
  const { conversationId } = await chat.ingest(channelId, { sessionId, message });
  const before = await t.prisma.message.count({ where: { conversationId, sender: 'CUSTOMER' } });
  const reply = await waitFor(async () => {
    const out = await t.prisma.message.findMany({
      where: { conversationId, sender: { in: ['AI', 'HUMAN_AGENT'] } },
      orderBy: { createdAt: 'asc' },
    });
    return out.length >= before ? out[out.length - 1] : null;
  }, 8000);
  const conversation = await t.prisma.conversation.findUnique({ where: { id: conversationId } });
  return { reply, conversation, sessionId };
}

async function setLanguage(defaultLanguage: 'en' | 'si', matchCustomerLanguage: boolean) {
  await t.prisma.tenant.update({ where: { id: f.tenantId }, data: { defaultLanguage, matchCustomerLanguage } });
}

test('Sinhala greeting: conversation marked Sinhala, model told to reply in Sinhala', async () => {
  let system = '';
  t.ai.script = [(m) => ((system = systemOf(m)), { content: 'ආයුබෝවන්! අද ඔබට කොහොමද උදව් කරන්න පුළුවන්?' })];
  const { reply, conversation } = await say('ආයුබෝවන්');
  assert.equal(conversation.language, 'si');
  assert.match(system, /REPLY LANGUAGE — SINHALA/);
  assert.match(reply.content, SINHALA);
  assert.equal(t.ai.calls.length > 0, true);
});

test('Sinhala question: knowledge search uses the Sinhala text AND an English translation', async () => {
  embedded.length = 0;
  let system = '';
  t.ai.script = [
    { content: '{"intent":"knowledge","agent":"knowledge_agent","confidence":0.92,"search_query":"What are your opening hours?"}' },
    (m) => ((system = systemOf(m)), { content: 'අපි සඳුදා සිට සෙනසුරාදා දක්වා පෙ.ව. 9.00 සිට ප.ව. 7.00 දක්වා විවෘතයි.' }),
  ];
  const { reply } = await say('ඔයාලා විවෘත වෙලාවන් මොනවද?');
  assert.deepEqual(embedded.sort(), ['What are your opening hours?', 'ඔයාලා විවෘත වෙලාවන් මොනවද?'].sort());
  assert.match(system, /SINHALA/);
  assert.match(reply.content, SINHALA);
});

test('Singlish: model told to answer in Singlish; short "ok" keeps the language', async () => {
  let system = '';
  t.ai.script = [
    { content: '{"intent":"action","agent":"action_agent","confidence":0.9}' },
    (m) => ((system = systemOf(m)), { content: 'Hari, kiyatada welawa ona?' }),
  ];
  const first = await say('heta haircut ekak book karanna puluwanda?');
  assert.equal(first.conversation.language, 'si-Latn');
  assert.match(system, /REPLY LANGUAGE — SINGLISH/);

  t.ai.script = [(m) => ((system = systemOf(m)), { content: 'Hari, welawa kiyanna.' })];
  const second = await say('ok', first.sessionId);
  assert.equal(second.conversation.language, 'si-Latn');
  assert.match(system, /SINGLISH/);
});

test('asking for a person in Singlish: handed to staff, customer told in Singlish, staff told the language', async () => {
  const callsBefore = t.ai.calls.length;
  const { reply, conversation } = await say('manussayek ekka katha karanna ona');
  assert.equal(t.ai.calls.length, callsBefore, 'no model call needed');
  assert.equal(reply.content, 'Oyawa ape team ekata connect kala. Ape kenek ikmanata oyata udaw karai.');
  const handoff = await t.prisma.humanHandoff.findFirst({ where: { conversationId: conversation.id } });
  assert.equal(handoff?.reason, 'CUSTOMER_REQUEST');
  const note = await waitFor(() =>
    t.prisma.notification.findFirst({ where: { tenantId: f.tenantId, metadata: { path: ['conversationId'], equals: conversation.id } } }),
  );
  assert.match(note.body, /writes in Singlish/);
});

test('when the AI fails, a Sinhala customer gets the error notice in Sinhala', async () => {
  t.ai.script = [new Error('provider down')];
  const { reply } = await say('මට ඔබගේ මිල ගණන් දැනගන්න ඕන');
  assert.equal(reply.content, 'සමාවෙන්න, ඔබගේ ඉල්ලීම සැකසීමේදී ගැටලුවක් ඇති වුණා. අපේ කණ්ඩායමට දැනුම් දුන්නා, ඔවුන් ඉක්මනින්ම ඔබට උදව් කරයි.');
});

test('business settings: fixed reply language, and a Sinhala default for unknown customers', async () => {
  try {
    // Always English, even to a Sinhala customer.
    await setLanguage('en', false);
    let system = '';
    t.ai.script = [(m) => ((system = systemOf(m)), { content: 'Hello!' })];
    const fixed = await say('ආයුබෝවන්');
    assert.equal(fixed.conversation.language, 'si', 'still recorded for staff');
    assert.match(system, /REPLY LANGUAGE: Reply in English/);

    // Sinhala by default; first message tells us nothing about language.
    await setLanguage('si', true);
    t.ai.script = [
      { content: '{"intent":"support","agent":"support_agent","confidence":0.9}' },
      (m) => ((system = systemOf(m)), { content: 'ඔබට කොහොමද උදව් කරන්න පුළුවන්?' }),
    ];
    const unknown = await say('😊👍');
    assert.equal(unknown.conversation.language, null);
    assert.match(system, /SINHALA/);

    const config = await chat.getConfig(channelId);
    assert.equal(config.language, 'si');
    assert.match(config.greeting, SINHALA);
  } finally {
    await setLanguage('en', true);
  }
});

test('staff can filter conversations by language', async () => {
  const { ConversationService } = await import('../../src/modules/conversation/conversation.service');
  const list = (language?: 'en' | 'si' | 'si-Latn') => t.get<any>(ConversationService).list(f.tenantId, { language, pageSize: 100 });
  const si = await list('si');
  const singlish = await list('si-Latn');
  assert.ok(si.data.length >= 3);
  assert.ok(si.data.every((c: any) => c.language === 'si'));
  assert.ok(singlish.data.length >= 2);
  assert.ok(singlish.data.every((c: any) => c.language === 'si-Latn'));
});
