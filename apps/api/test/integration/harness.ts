/**
 * Integration test harness. Boots the real Nest application against an
 * ISOLATED test database (name must end in "_test") and an isolated Redis key
 * prefix. Only the AI model is replaced, by a scripted test double, so runs are
 * deterministic and free. Every fixture tenant is deleted afterwards.
 *
 * Prepare the database once with `pnpm db:reset:test` (or it is migrated on
 * first use below).
 */
import 'reflect-metadata';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const ROOT = resolve(__dirname, '../../../..');

function loadDotEnv(): Record<string, string> {
  const p = resolve(ROOT, '.env');
  if (!existsSync(p)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
  return out;
}

export function testDatabaseUrl(): string {
  const env = loadDotEnv();
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const base = (process.env.DATABASE_URL_BASE ?? env.DATABASE_URL ?? '').split('?')[0]!;
  if (!base) throw new Error('Set TEST_DATABASE_URL (or DATABASE_URL in .env) to run integration tests.');
  return `${base.slice(0, base.lastIndexOf('/'))}/ai_employee_test?schema=public`;
}

/** Configure env BEFORE any app module is imported. */
export function configureTestEnv(opts: { worker?: boolean } = {}) {
  const env = loadDotEnv();
  const url = testDatabaseUrl();
  const dbName = url.split('?')[0]!.split('/').pop()!;
  if (!dbName.endsWith('_test')) {
    throw new Error(`Refusing to run integration tests against "${dbName}" — the database name must end in _test.`);
  }
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: url,
    REDIS_URL: process.env.REDIS_URL ?? env.REDIS_URL ?? 'redis://localhost:6379',
    BULL_PREFIX: `aiwtest${process.pid}`,
    AI_WORKFORCE_SCHEDULER: 'false',
    AI_WORKFORCE_WORKER: opts.worker ? 'true' : 'false',
    JWT_ACCESS_SECRET: 'test-access-secret-not-for-production-0001',
    JWT_REFRESH_SECRET: 'test-refresh-secret-not-for-production-002',
    CREDENTIALS_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    INTERNAL_SERVICE_TOKEN: 'test-service-token',
    RESEND_API_KEY: '',
    // The model is scripted, but the setup check needs an AI key to exist.
    AI_DEFAULT_PROVIDER: 'GEMINI',
    AI_ALLOW_PLATFORM_KEYS: 'true',
    GEMINI_API_KEY: 'test-platform-key-never-called',
    N8N_API_URL: '',
    // Generous platform defaults so only tests that set limits hit them.
    AI_DEFAULT_DAILY_BUDGET_USD: '100',
    AI_DEFAULT_MONTHLY_BUDGET_USD: '1000',
    AI_DEFAULT_MAX_TASK_COST_USD: '5',
  });
  migrateOnce(url);
}

let migrated = false;
function migrateOnce(url: string) {
  if (migrated) return;
  execSync('npx prisma migrate deploy --schema prisma/schema.prisma', {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
  migrated = true;
}

// ── Scripted AI model ────────────────────────────────────────────────────

type Reply = {
  content?: string;
  toolCalls?: { name: string; arguments: Record<string, unknown> }[];
  costUsd?: number;
};
export type ScriptStep = Reply | Error | ((messages: { role: string; content: string }[]) => Reply | Error);

/**
 * Stands in for AiProviderService. Each call consumes the next scripted step
 * and writes a real AiUsageLog row (that is what budgets are measured from).
 */
export class ScriptedAi {
  script: ScriptStep[] = [];
  calls: { tenantId: string; messages: { role: string; content: string }[]; opts?: { taskId?: string; tools?: unknown[] } }[] = [];
  prisma!: any;
  fallback: Reply = { content: '**Summary**\nDone.' };

  async complete(tenantId: string, agentType: string, messages: any[], opts?: any) {
    this.calls.push({ tenantId, messages, opts });
    const next = this.script.length ? this.script.shift()! : this.fallback;
    const step = typeof next === 'function' ? next(messages) : next;
    if (step instanceof Error) throw step;
    const cost = step.costUsd ?? 0.001;
    await this.prisma.aiUsageLog.create({
      data: {
        tenantId,
        agentType,
        provider: 'GEMINI',
        model: 'scripted-test-model',
        inputTokens: 100,
        outputTokens: 40,
        estimatedCostUsd: cost,
        executionTimeMs: 1,
        taskId: opts?.taskId ?? null,
      },
    });
    return {
      content: step.content ?? '',
      toolCalls: (step.toolCalls ?? []).map((c, i) => ({ id: `call_${i}`, ...c })),
      inputTokens: 100,
      outputTokens: 40,
      cachedInputTokens: 0,
      model: 'scripted-test-model',
      estimatedCostUsd: cost,
    };
  }

  async embed(): Promise<never> {
    throw new Error('Embeddings are not available in tests');
  }
}

// ── App + fixtures ───────────────────────────────────────────────────────

export interface TestApp {
  app: any;
  prisma: any;
  ai: ScriptedAi;
  get<T>(token: any): T;
  close(): Promise<void>;
}

export async function bootApp(): Promise<TestApp> {
  const { Test } = await import('@nestjs/testing');
  const { AppModule } = await import('../../src/app.module');
  const { AiProviderService } = await import('../../src/modules/ai-provider/ai-provider.service');
  const { PrismaService } = await import('../../src/prisma/prisma.service');

  const ai = new ScriptedAi();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AiProviderService)
    .useValue(ai)
    .compile();
  const app = moduleRef.createNestApplication({ logger: ['error'], rawBody: true });
  const { configureApp } = await import('../../src/bootstrap');
  configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  ai.prisma = prisma;
  return {
    app,
    prisma,
    ai,
    get: (t) => app.get(t),
    close: async () => {
      try {
        const { getQueueToken } = await import('@nestjs/bullmq');
        for (const name of ['ai-workforce-tasks', 'ai-workforce-maintenance']) {
          const q = app.get(getQueueToken(name), { strict: false });
          await q?.obliterate({ force: true }).catch(() => undefined);
        }
      } finally {
        await app.close();
      }
    },
  };
}

export interface TenantFixture {
  tenantId: string;
  ownerId: string;
  employeeId: string;
  slug: string;
}

let seq = 0;
/** A fully isolated business: tenant, owner membership, business, one AI employee. */
export async function createTenant(
  prisma: any,
  o: {
    name?: string;
    employee?: Record<string, unknown>;
    role?: 'OWNER' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
    /** Defaults to AI so tests written before reply modes keep their meaning. */
    replyMode?: 'AI' | 'HYBRID' | 'NO_AI';
    plan?: string;
  } = {},
): Promise<TenantFixture> {
  const tag = `${process.pid}-${Date.now()}-${seq++}`;
  const tenant = await prisma.tenant.create({
    data: {
      name: o.name ?? `Test Business ${tag}`,
      slug: `t-${tag}`,
      status: 'ACTIVE',
      replyMode: o.replyMode ?? 'AI',
      ...(o.plan ? { plan: o.plan } : {}),
    },
  });
  const owner = await prisma.user.create({
    data: { email: `owner-${tag}@example.test`, passwordHash: 'x', firstName: 'Test', lastName: 'Owner' },
  });
  await prisma.tenantMembership.create({ data: { tenantId: tenant.id, userId: owner.id, role: o.role ?? 'OWNER', status: 'ACTIVE' } });
  await prisma.business.create({
    data: { tenantId: tenant.id, name: tenant.name, type: 'SALON', timezone: 'Asia/Colombo', profile: { description: 'A neighbourhood hair salon.' } },
  });
  const emp = await prisma.aiEmployee.create({
    data: {
      tenantId: tenant.id,
      name: 'Operations Analyst',
      role: 'Analyst',
      department: 'Operations',
      businessFunction: 'operations',
      description: 'Monitors operations',
      actionLevel: 'APPROVAL_REQUIRED',
      permissions: { viewCustomers: true },
      ...(o.employee ?? {}),
    },
  });
  return { tenantId: tenant.id, ownerId: owner.id, employeeId: emp.id, slug: tenant.slug };
}

export async function deleteTenant(prisma: any, f: TenantFixture) {
  await prisma.tenant.delete({ where: { id: f.tenantId } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: f.ownerId } });
}

export async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, timeoutMs = 15000, everyMs = 100): Promise<T> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > until) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, everyMs));
  }
}
