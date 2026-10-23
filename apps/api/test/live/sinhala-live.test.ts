/**
 * Opt-in: real model replies to Sinhala, Singlish and English customers
 * (uses real API credit). Isolated test database; fixtures are deleted after.
 *
 *   LIVE_AI=1 pnpm --filter @ai-employee/api exec node --test --require ts-node/register/transpile-only test/live/sinhala-live.test.ts
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { configureTestEnv, createTenant, deleteTenant, TenantFixture, waitFor } from '../integration/harness';
import { claimsBooking } from '../../src/common/language/language';

const enabled = process.env.LIVE_AI === '1';
configureTestEnv();
for (const line of readFileSync(resolve(__dirname, '../../../../.env'), 'utf8').split('\n')) {
  const m = line.match(/^(GEMINI_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|AI_DEFAULT_PROVIDER|AI_DEFAULT_MODEL)=(.+)$/);
  if (m) process.env[m[1]!] = m[2]!.trim();
}

const SINHALA = /[඀-෿]/;
const FACTS = [
  'Lanka Glow Salon price list: Haircut LKR 2,000. Gold Facial LKR 4,500. Bridal dressing LKR 45,000. Manicure LKR 1,800.',
  'Opening hours: Monday to Saturday 9:00 AM to 7:00 PM. Closed on Sundays and Poya days.',
  'Location: 112 High Level Road, Nugegoda, Colombo. Free parking behind the building.',
  'Cancellation policy: cancel at least 4 hours before the appointment, otherwise a LKR 500 fee applies.',
];

/* eslint-disable @typescript-eslint/no-explicit-any */
let app: any;
let prisma: any;
let f: TenantFixture;
let chat: any;
let channelId: string;
const transcript: string[] = [];

before(async () => {
  if (!enabled) return;
  const { Test } = await import('@nestjs/testing');
  const { AppModule } = await import('../../src/app.module');
  const { PrismaService } = await import('../../src/prisma/prisma.service');
  const { AiProviderService } = await import('../../src/modules/ai-provider/ai-provider.service');
  const { WebsiteChatService } = await import('../../src/modules/website-chat/website-chat.service');
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication({ logger: ['error', 'warn'] });
  await app.init();
  prisma = app.get(PrismaService);
  chat = app.get(WebsiteChatService);

  f = await createTenant(prisma, { name: 'Lanka Glow Salon' });
  channelId = (await prisma.channel.create({ data: { tenantId: f.tenantId, type: 'WEBSITE_CHAT', name: 'Website', status: 'ACTIVE', config: {} } })).id;

  // An English knowledge document, as most businesses will have.
  const kb = await prisma.knowledgeBase.create({ data: { tenantId: f.tenantId, name: 'Salon info' } });
  const doc = await prisma.document.create({ data: { tenantId: f.tenantId, knowledgeBaseId: kb.id, title: 'Salon facts', sourceType: 'TEXT', status: 'READY' } });
  const ai = app.get(AiProviderService);
  for (const [i, content] of FACTS.entries()) {
    const { embedding } = await ai.embed(f.tenantId, content);
    const vector = `[${embedding.join(',')}]`;
    await prisma.$executeRaw`
      INSERT INTO document_chunks (id, "tenantId", "documentId", "knowledgeBaseId", content, embedding, "chunkIndex", "tokenCount", "createdAt")
      VALUES (${randomUUID()}, ${f.tenantId}, ${doc.id}, ${kb.id}, ${content}, ${vector}::vector, ${i}, 30, now())`;
  }
});

after(async () => {
  if (!enabled) return;
  console.log(`\n──── Conversation transcript ────\n${transcript.join('\n')}\n`);
  if (f) await deleteTenant(prisma, f);
  await app.close();
});

// The free Gemini tier allows ~5 requests a minute; each message uses up to 2.
const PACE_MS = Number(process.env.LIVE_PACE_MS ?? 26000);
let lastSent = 0;

async function say(message: string, sessionId: string) {
  const wait = lastSent + PACE_MS - Date.now();
  if (lastSent && wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastSent = Date.now();
  const { conversationId } = await chat.ingest(channelId, { sessionId, message });
  const customerCount = await prisma.message.count({ where: { conversationId, sender: 'CUSTOMER' } });
  const reply = await waitFor(async () => {
    const out = await prisma.message.findMany({ where: { conversationId, sender: { in: ['AI', 'HUMAN_AGENT'] } }, orderBy: { createdAt: 'asc' } });
    return out.length >= customerCount ? out[out.length - 1] : null;
  }, 60000, 300);
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  transcript.push(`[${conversation.language}] Customer: ${message}\n        ${reply.agentType}: ${reply.content}`);
  return { text: reply.content as string, agent: reply.agentType as string, language: conversation.language as string };
}

const opts = { skip: !enabled && 'set LIVE_AI=1', timeout: 180000 };

test('Sinhala greeting gets a Sinhala reply', opts, async () => {
  const r = await say('ආයුබෝවන්', 'live-si-1');
  assert.equal(r.language, 'si');
  assert.match(r.text, SINHALA);
});

test('Sinhala price question is answered in Sinhala from the English price list', opts, async () => {
  const r = await say('Gold facial එකක ගාන කීයද?', 'live-si-1');
  assert.match(r.text, SINHALA);
  assert.match(r.text, /4[,.]?500/);
});

test('Sinhala opening-hours question', opts, async () => {
  const r = await say('ඉරිදා දවසේ ඔයාලා විවෘතද?', 'live-si-2');
  assert.match(r.text, SINHALA);
});

test('Singlish location question gets a Singlish reply', opts, async () => {
  const r = await say('oyala koheda thiyenne? parking thiyenawada?', 'live-sl-1');
  assert.equal(r.language, 'si-Latn');
  assert.doesNotMatch(r.text, SINHALA);
  assert.match(r.text, /Nugegoda/i);
});

test('Singlish booking request: asks for details, never claims a booking', opts, async () => {
  const r = await say('heta haircut ekak book karanna ona', 'live-sl-2');
  assert.doesNotMatch(r.text, SINHALA);
  assert.equal(claimsBooking(r.text), false, r.text);
});

test('English customer still gets English', opts, async () => {
  const r = await say('How much is a manicure?', 'live-en-1');
  assert.equal(r.language, 'en');
  assert.doesNotMatch(r.text, SINHALA);
  assert.match(r.text, /1[,.]?800/);
});
