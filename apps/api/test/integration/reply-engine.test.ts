/**
 * Reply engine through the real app and the isolated test database: inbound
 * website chat → reply mode → saved answers / fixed replies / AI / staff.
 * The AI is scripted and every call is recorded, so "No AI" is checked by
 * counting calls, not by trusting a flag.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as bcrypt from 'bcrypt';
import { TestApp, TenantFixture, bootApp, configureTestEnv, createTenant, deleteTenant, waitFor } from './harness';

configureTestEnv();

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: TestApp;
let base: string;
let chat: any;
const fixtures: TenantFixture[] = [];
const extraUsers: string[] = [];
const PASSWORD = 'correct-horse-battery-staple';
let seq = 0;

const HOURS = {
  questions: ['What are your opening hours?', 'When are you open?', 'විවෘත වේලාවන් මොනවද?', 'kiyatada open karanne'],
  answerEn: 'We are open 9am to 7pm, Monday to Saturday.',
  answerSi: 'අපි සඳුදා සිට සෙනසුරාදා දක්වා උදේ 9 සිට රෑ 7 දක්වා විවෘතයි.',
  answerSiLatn: 'Api Sandudha idan Senasurada wenakan ude 9 idan ra 7 wenakan open.',
};
const PRICE = { questions: ['How much is a haircut?', 'haircut price'], answerEn: 'A haircut is Rs. 1500.', answerSi: '', answerSiLatn: '' };

before(async () => {
  t = await bootApp();
  t.ai.embed = (async () => ({ embedding: Array(1536).fill(0.01), tokenCount: 0 })) as any;
  await t.app.listen(0);
  base = `http://127.0.0.1:${t.app.getHttpServer().address().port}`;
  const { WebsiteChatService } = await import('../../src/modules/website-chat/website-chat.service');
  chat = t.get(WebsiteChatService);
});

after(async () => {
  try {
    for (const f of fixtures) await deleteTenant(t.prisma, f);
    // Audit entries point at the test admin; remove them before the user.
    await t.prisma.platformAuditLog.deleteMany({ where: { actorUserId: { in: extraUsers } } });
    await t.prisma.user.deleteMany({ where: { id: { in: extraUsers } } });
    await t.prisma.planSettings.deleteMany({ where: { planId: { startsWith: 'test-plan-' } } });
  } finally {
    // fetch() keeps connections open; close them so the server can shut down.
    t.app.getHttpServer().closeAllConnections?.();
    await t.close();
  }
});

async function business(mode: 'AI' | 'HYBRID' | 'NO_AI', answers = [HOURS, PRICE], plan?: string) {
  const f = await createTenant(t.prisma, { name: `Glow Salon ${seq++}`, replyMode: mode, plan });
  fixtures.push(f);
  for (const a of answers) await t.prisma.savedAnswer.create({ data: { tenantId: f.tenantId, ...a } });
  const channel = await t.prisma.channel.create({
    data: { tenantId: f.tenantId, type: 'WEBSITE_CHAT', name: 'Website', status: 'ACTIVE', config: {} },
  });
  return { ...f, channelId: channel.id };
}

const replies = (conversationId: string) =>
  t.prisma.message.findMany({ where: { conversationId, sender: { in: ['AI', 'HUMAN_AGENT'] } }, orderBy: { createdAt: 'asc' } });

/** One customer message; resolves with the system's reply (or null when it stays quiet). */
async function say(b: { channelId: string }, message: string, sessionId = `s-${seq++}`, expectReply = true) {
  const known = await t.prisma.conversation.findFirst({ where: { channelId: b.channelId, customer: { externalId: sessionId } } }).catch(() => null);
  const beforeCount = known ? (await replies(known.id)).length : 0;
  const { conversationId } = await chat.ingest(b.channelId, { sessionId, message });
  if (!expectReply) {
    await new Promise((r) => setTimeout(r, 800));
    const out = await replies(conversationId);
    return { reply: out.length > beforeCount ? out[out.length - 1] : null, conversationId, sessionId };
  }
  const reply = await waitFor(async () => {
    const out = await replies(conversationId);
    return out.length > beforeCount ? out[out.length - 1] : null;
  }, 8000);
  return { reply, conversationId, sessionId };
}

function aiCallsFor(tenantId: string) {
  return t.ai.calls.filter((c) => c.tenantId === tenantId).length;
}

describe('No-AI mode', () => {
  test('answers a saved question in the customer language without calling AI', async () => {
    const b = await business('NO_AI');
    const en = await say(b, 'when r u open?');
    assert.equal(en.reply.content, HOURS.answerEn);
    assert.equal(en.reply.metadata.replySource, 'saved_answer');
    const si = await say(b, 'විවෘත වේලාවන් මොනවද');
    assert.equal(si.reply.content, HOURS.answerSi);
    const singlish = await say(b, 'kiyatada open krnne');
    assert.equal(singlish.reply.content, HOURS.answerSiLatn);
    assert.equal(aiCallsFor(b.tenantId), 0);
    const row = await waitFor(async () => {
      const r = await t.prisma.savedAnswer.findFirst({ where: { tenantId: b.tenantId, answerEn: HOURS.answerEn } });
      return r.useCount >= 3 ? r : null;
    }, 3000);
    assert.ok(row.lastUsedAt);
  });

  test('greets with the business name, no AI', async () => {
    const b = await business('NO_AI');
    const { reply } = await say(b, 'ayubowan');
    assert.match(reply.content, /Glow Salon/);
    assert.equal(reply.metadata.replySource, 'template');
    assert.equal(aiCallsFor(b.tenantId), 0);
  });

  test('unknown question goes to staff once, and becomes a suggestion that counts repeats', async () => {
    const b = await business('NO_AI');
    const first = await say(b, 'Do you do bridal makeup packages?');
    assert.equal(first.reply.metadata.replySource, 'handoff');
    assert.match(first.reply.content, /team will reply/);
    assert.equal(await t.prisma.humanHandoff.count({ where: { conversationId: first.conversationId } }), 1);

    // Same chat, follow-up while staff haven't answered: no repeated "team will reply".
    const followUp = await say(b, 'and how long does bridal makeup take?', first.sessionId, false);
    assert.equal(followUp.reply, null);
    assert.equal(await t.prisma.humanHandoff.count({ where: { conversationId: first.conversationId } }), 1);

    // Another customer asks the same thing: the suggestion's count goes up.
    await say(b, 'do you do bridal make up packages');
    const suggestions = await t.prisma.savedAnswer.findMany({ where: { tenantId: b.tenantId, status: 'SUGGESTED' } });
    const bridal = suggestions.find((s: any) => /bridal makeup packages/i.test(s.questions[0]));
    assert.ok(bridal, JSON.stringify(suggestions));
    assert.equal(bridal.askedCount, 2);
    assert.equal(aiCallsFor(b.tenantId), 0);
  });

  test('a saved answer still answers after staff were called in the same chat', async () => {
    const b = await business('NO_AI');
    const first = await say(b, 'Do you sell gift vouchers?');
    assert.equal(first.reply.metadata.replySource, 'handoff');
    const next = await say(b, 'how much is a haircut', first.sessionId);
    assert.equal(next.reply.content, PRICE.answerEn);
  });

  test('asking for a person always reaches staff', async () => {
    const b = await business('NO_AI');
    const { reply, conversationId } = await say(b, 'I want to talk to a human');
    assert.equal(reply.metadata.replySource, 'handoff');
    assert.equal(await t.prisma.humanHandoff.count({ where: { conversationId, reason: 'CUSTOMER_REQUEST' } }), 1);
    assert.equal(aiCallsFor(b.tenantId), 0);
  });
});

describe('Hybrid mode', () => {
  test('saved answers and greetings cost nothing; other questions go to AI', async () => {
    const b = await business('HYBRID');
    await say(b, 'hi');
    await say(b, 'How much is a haircut?');
    assert.equal(aiCallsFor(b.tenantId), 0);

    t.ai.script = [{ content: '{"intent":"support","agent":"support_agent","confidence":0.9}' }, { content: 'Yes, we do bridal makeup.' }];
    const { reply } = await say(b, 'Do you do bridal makeup?');
    assert.equal(reply.content, 'Yes, we do bridal makeup.');
    assert.equal(reply.metadata.replySource, 'ai');
    assert.equal(aiCallsFor(b.tenantId), 2);
  });

  test('a close saved answer is given to the AI as an approved fact', async () => {
    const b = await business('HYBRID');
    let prompt = '';
    t.ai.script = [
      { content: '{"intent":"knowledge","agent":"knowledge_agent","confidence":0.9}' },
      (m) => ((prompt = m.map((x) => x.content).join('\n')), { content: 'We are closed on poya days.' }),
    ];
    await say(b, 'are you open on poya day');
    assert.match(prompt, /approved answer from the business\) We are open 9am to 7pm/);
  });

  test('a booking request goes to AI even when it mentions a saved topic', async () => {
    const b = await business('HYBRID');
    t.ai.script = [{ content: '{"intent":"support","agent":"support_agent","confidence":0.9}' }, { content: 'Sure, what time?' }];
    const { reply } = await say(b, 'can I book a haircut, how much is a haircut');
    assert.equal(reply.metadata.replySource, 'ai');
  });

  test('missing Singlish answer: AI writes it in Singlish using the saved facts', async () => {
    const b = await business('HYBRID');
    let prompt = '';
    t.ai.script = [
      { content: '{"intent":"knowledge","agent":"knowledge_agent","confidence":0.9,"search_query":"haircut price"}' },
      (m) => ((prompt = m.map((x) => x.content).join('\n')), { content: 'Haircut ekak Rs. 1500.' }),
    ];
    const { reply } = await say(b, 'haircut price kiyada');
    assert.equal(reply.metadata.replySource, 'ai');
    assert.match(prompt, /Rs\. 1500/);
  });

  test('AI budget used up: saved answers still work, other questions go to staff, no AI calls', async () => {
    const b = await business('HYBRID');
    await t.prisma.tenantAiSettings.create({ data: { tenantId: b.tenantId, dailyBudgetUsd: 0.001 } });
    await t.prisma.aiUsageLog.create({
      data: { tenantId: b.tenantId, agentType: 'SUPPORT', provider: 'GEMINI', model: 'x', inputTokens: 1, outputTokens: 1, estimatedCostUsd: 0.01, executionTimeMs: 1 },
    });
    const missingTranslation = await say(b, 'haircut price kiyada');
    assert.equal(missingTranslation.reply.content, PRICE.answerEn, 'falls back to the language that exists');
    const unknown = await say(b, 'Do you do bridal makeup?');
    assert.equal(unknown.reply.metadata.replySource, 'handoff');
    assert.equal(aiCallsFor(b.tenantId), 0);
  });
});

describe('AI mode and failures', () => {
  test('AI mode keeps every reply on the AI (original behaviour)', async () => {
    const b = await business('AI');
    t.ai.script = [{ content: 'Hello! How can I help?' }];
    const { reply } = await say(b, 'hi');
    assert.equal(reply.metadata.replySource, 'ai');
    assert.equal(aiCallsFor(b.tenantId), 1);
  });

  test('when the AI fails, a matching saved answer is sent instead of an error', async () => {
    const b = await business('AI');
    t.ai.script = [new Error('provider down')];
    const { reply } = await say(b, 'When are you open?');
    assert.equal(reply.content, HOURS.answerEn);
  });

  test('when the AI fails and nothing matches, staff take over with an apology', async () => {
    const b = await business('AI');
    t.ai.script = [new Error('provider down')];
    const { reply, conversationId } = await say(b, 'Do you do bridal makeup?');
    assert.match(reply.content, /encountered an issue/);
    assert.equal(await t.prisma.humanHandoff.count({ where: { conversationId, reason: 'REPEATED_FAILURE' } }), 1);
  });

  test('no automatic reply while a staff member has taken over the chat', async () => {
    const b = await business('AI');
    t.ai.script = [{ content: 'Hello!' }];
    const first = await say(b, 'hello');
    await t.prisma.conversation.update({ where: { id: first.conversationId }, data: { status: 'HUMAN_HANDLING' } });
    const calls = aiCallsFor(b.tenantId);
    const next = await say(b, 'When are you open?', first.sessionId, false);
    assert.equal(next.reply, null);
    assert.equal(aiCallsFor(b.tenantId), calls);
  });
});

// ── HTTP: settings, plans, permissions, stats ────────────────────────────

async function login(email: string): Promise<string> {
  const res = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) });
  assert.equal(res.status, 200, await res.clone().text());
  return (await res.json()).accessToken;
}

const api = (path: string, token: string, init: RequestInit = {}) =>
  fetch(`${base}${path}`, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });

async function userIn(tenantId: string | null, role: 'OWNER' | 'EMPLOYEE' | null, platformRole: 'NONE' | 'SUPER_ADMIN' = 'NONE') {
  const u = await t.prisma.user.create({
    data: {
      email: `re-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`,
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      firstName: 'T',
      lastName: 'User',
      platformRole,
    },
  });
  extraUsers.push(u.id);
  if (tenantId && role) await t.prisma.tenantMembership.create({ data: { tenantId, userId: u.id, role, status: 'ACTIVE' } });
  return login(u.email);
}

describe('Reply settings and plans over HTTP', () => {
  test('the plan limits which reply modes an owner can pick, and the engine follows the plan', async () => {
    const plan = `test-plan-${Date.now()}`;
    await t.prisma.planSettings.create({ data: { planId: plan, allowedReplyModes: ['NO_AI'] } });
    const b = await business('HYBRID', [HOURS], plan);
    const owner = await userIn(b.tenantId, 'OWNER');

    const settings = await (await api('/reply-settings', owner)).json();
    assert.deepEqual(settings, { plan, mode: 'HYBRID', effectiveMode: 'NO_AI', allowedModes: ['NO_AI'], smartRouting: { available: false, enabled: true } });
    assert.equal((await api('/reply-settings', owner, { method: 'PATCH', body: JSON.stringify({ mode: 'AI' }) })).status, 400);
    assert.equal((await api('/reply-settings', owner, { method: 'PATCH', body: JSON.stringify({ mode: 'NO_AI' }) })).status, 200);

    await say(b, 'Do you do bridal makeup?');
    assert.equal(aiCallsFor(b.tenantId), 0, 'the plan forces No-AI even though the business chose Hybrid');
  });

  test('platform admin sets plan reply modes; business owners cannot', async () => {
    const b = await business('HYBRID', []);
    const owner = await userIn(b.tenantId, 'OWNER');
    const admin = await userIn(null, null, 'SUPER_ADMIN');

    assert.equal((await api('/admin/plans/starter/reply-modes', owner, { method: 'PATCH', body: JSON.stringify({ allowedReplyModes: ['AI'] }) })).status, 403);
    assert.equal((await api('/admin/plans/nope/reply-modes', admin, { method: 'PATCH', body: JSON.stringify({ allowedReplyModes: ['AI'] }) })).status, 404);
    assert.equal((await api('/admin/plans/starter/reply-modes', admin, { method: 'PATCH', body: JSON.stringify({ allowedReplyModes: [] }) })).status, 400);

    const before = await t.prisma.planSettings.findUnique({ where: { planId: 'starter' } });
    try {
      const res = await api('/admin/plans/starter/reply-modes', admin, { method: 'PATCH', body: JSON.stringify({ allowedReplyModes: ['NO_AI', 'HYBRID'] }) });
      assert.equal(res.status, 200);
      assert.deepEqual((await res.json()).allowedReplyModes, ['HYBRID', 'NO_AI']);
      const plans = await (await api('/admin/plans', admin)).json();
      assert.deepEqual(plans.find((p: any) => p.id === 'starter').allowedReplyModes, ['HYBRID', 'NO_AI']);
      assert.equal(await t.prisma.platformAuditLog.count({ where: { action: 'plan.reply_modes.update', targetId: 'starter' } }) > 0, true);
    } finally {
      if (before) await t.prisma.planSettings.update({ where: { planId: 'starter' }, data: { allowedReplyModes: before.allowedReplyModes } });
      else await t.prisma.planSettings.deleteMany({ where: { planId: 'starter' } });
    }
  });

  test('owners manage saved answers; staff can read them but not change them', async () => {
    const b = await business('NO_AI', []);
    const owner = await userIn(b.tenantId, 'OWNER');
    const staff = await userIn(b.tenantId, 'EMPLOYEE');

    assert.equal((await api('/saved-answers', owner, { method: 'POST', body: JSON.stringify({ questions: [], answerEn: 'x' }) })).status, 400);
    assert.equal((await api('/saved-answers', owner, { method: 'POST', body: JSON.stringify({ questions: ['Parking?'] }) })).status, 400);
    assert.equal((await api('/saved-answers', staff, { method: 'POST', body: JSON.stringify({ questions: ['Do you have parking?'], answerEn: 'Yes' }) })).status, 403);

    const created = await api('/saved-answers', owner, {
      method: 'POST',
      body: JSON.stringify({ questions: ['Do you have parking?', 'do you have parking?', ' '], answerEn: 'Yes, free parking behind the salon.' }),
    });
    assert.equal(created.status, 201);
    const row = await created.json();
    assert.deepEqual(row.questions, ['Do you have parking?'], 'duplicates and blanks are dropped');

    const list = await (await api('/saved-answers?status=ACTIVE', staff)).json();
    assert.equal(list.length, 1);

    // Takes effect immediately for customers (cache cleared on save).
    const { reply } = await say(b, 'do u have parking');
    assert.equal(reply.content, 'Yes, free parking behind the salon.');

    const tried = await (await api('/saved-answers/test', staff, { method: 'POST', body: JSON.stringify({ message: 'is there parking', language: 'si' }) })).json();
    assert.equal(tried.matched, true);
    assert.equal(tried.replyLanguageMissing, true);

    assert.equal((await api(`/saved-answers/${row.id}`, owner, { method: 'PATCH', body: JSON.stringify({ status: 'DISABLED' }) })).status, 200);
    const off = await say(b, 'do u have parking');
    assert.equal(off.reply.metadata.replySource, 'handoff');

    assert.equal((await api(`/saved-answers/${row.id}`, staff, { method: 'DELETE' })).status, 403);
    assert.equal((await api(`/saved-answers/${row.id}`, owner, { method: 'DELETE' })).status, 200);
  });

  test('a suggestion can be turned into an answer, and stats count replies without AI', async () => {
    const b = await business('NO_AI');
    const owner = await userIn(b.tenantId, 'OWNER');
    await say(b, 'Can I pay by card?');
    const [suggestion] = await (await api('/saved-answers?status=SUGGESTED', owner)).json();
    assert.equal(suggestion.questions[0], 'Can I pay by card?');
    const res = await api(`/saved-answers/${suggestion.id}`, owner, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'ACTIVE', answerEn: 'Yes, we accept Visa and Mastercard.' }),
    });
    assert.equal(res.status, 200);
    const { reply } = await say(b, 'can i pay by card');
    assert.equal(reply.content, 'Yes, we accept Visa and Mastercard.');

    await say(b, 'hello');
    const stats = await (await api('/saved-answers/stats?days=7', owner)).json();
    assert.equal(stats.savedAnswerReplies, 1);
    assert.equal(stats.quickReplies, 1);
    assert.equal(stats.handedToStaff, 1);
    assert.equal(stats.answeredWithoutAi, 2);
    assert.equal(stats.withoutAiPercent, 67);
    assert.equal(stats.openSuggestions, 0);
  });

  test('another business cannot see or edit these saved answers', async () => {
    const a = await business('NO_AI');
    const other = await business('NO_AI', []);
    const otherOwner = await userIn(other.tenantId, 'OWNER');
    const mine = await t.prisma.savedAnswer.findFirst({ where: { tenantId: a.tenantId } });
    assert.equal((await (await api('/saved-answers', otherOwner)).json()).length, 0);
    assert.equal((await api(`/saved-answers/${mine.id}`, otherOwner, { method: 'PATCH', body: JSON.stringify({ answerEn: 'hacked' }) })).status, 404);
    assert.equal((await api(`/saved-answers/${mine.id}`, otherOwner, { method: 'DELETE' })).status, 404);
  });
});
