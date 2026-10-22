import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  LimitReachedError,
  RepeatedCallGuard,
  decideOnFailure,
  isTransientError,
  providerRetryAfterMs,
  retryDelayMs,
} from '../src/modules/ai-workforce/retry-policy';
import { assertScheduleAllowed, nextRun } from '../src/modules/ai-workforce/cron';
import { mergeLimits, platformDefaultLimits } from '../src/modules/ai-workforce/usage-limits.service';
import { validateEnv } from '../src/config/env.validation';
import { verifyHmacSignature } from '../src/common/crypto/webhook-signature';
import { platformDefaultModel } from '../src/modules/ai-provider/ai-provider.service';

describe('retry policy', () => {
  test('classifies transient vs permanent errors', () => {
    assert.ok(isTransientError(new Error('503 Service Unavailable')));
    assert.ok(isTransientError(new Error('RESOURCE_EXHAUSTED: quota')));
    assert.ok(isTransientError(new Error('connect ETIMEDOUT')));
    assert.ok(!isTransientError(new Error('Invalid API key')));
    assert.ok(!isTransientError(new Error('400 Bad Request: schema')));
  });

  test('backoff grows and is capped, with jitter', () => {
    const mid = () => 0.5;
    assert.equal(retryDelayMs(1, mid), 30_000);
    assert.equal(retryDelayMs(2, mid), 120_000);
    assert.equal(retryDelayMs(10, mid), 3_600_000);
    assert.ok(retryDelayMs(1, () => 0) >= 24_000 && retryDelayMs(1, () => 1) <= 36_000);
  });

  test('decides retry / fail / block', () => {
    assert.equal(decideOnFailure(new Error('503'), 1, 3).action, 'RETRY');
    assert.equal(decideOnFailure(new Error('503'), 3, 3).action, 'FAIL');
    assert.equal(decideOnFailure(new Error('bad key'), 1, 3).action, 'FAIL');
    assert.equal(decideOnFailure(new LimitReachedError('Daily AI budget reached'), 1, 3).action, 'BLOCK');
  });

  test("waits for the provider's own retry hint (e.g. a quota reset)", () => {
    const gemini = new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","details":[{"retryDelay":"4564s"}]}}');
    const d = decideOnFailure(gemini, 1, 3);
    assert.equal(d.action, 'RETRY');
    assert.ok(d.action === 'RETRY' && d.delayMs >= 4564_000);
    assert.equal(providerRetryAfterMs(new Error('Please retry in 1h16m4.5s.')), 4564500);
    assert.equal(providerRetryAfterMs(new Error('Retry-After: 120')), 120000);
    assert.equal(providerRetryAfterMs(new Error('boom')), null);
    const huge = decideOnFailure(new Error('429 retry in 30h'), 1, 3);
    assert.ok(huge.action === 'RETRY' && huge.delayMs <= 6 * 3600_000, 'capped');
  });

  test('repeated identical calls are detected regardless of key order', () => {
    const g = new RepeatedCallGuard(2);
    assert.equal(g.record('list', { a: 1, b: 2 }), false);
    assert.equal(g.record('list', { b: 2, a: 1 }), false);
    assert.equal(g.record('list', { a: 1, b: 2 }), true);
    assert.equal(g.record('list', { a: 2 }), false);
  });
});

describe('schedules', () => {
  test('cron is evaluated in the business timezone', () => {
    const from = new Date('2026-10-22T00:00:00Z');
    // 09:00 in Colombo (UTC+5:30) is 03:30 UTC.
    assert.equal(nextRun('0 9 * * *', 'Asia/Colombo', from).toISOString(), '2026-10-22T03:30:00.000Z');
  });

  test('rejects malformed, too frequent, or badly zoned schedules', () => {
    assert.throws(() => nextRun('0 9 * *', 'UTC'), /5-field/);
    assert.throws(() => nextRun('0 9 * * *', 'Nowhere/Land'), /Unknown timezone/);
    assert.throws(() => assertScheduleAllowed('*/5 * * * *', 'UTC'), /too often/);
    assert.ok(assertScheduleAllowed('*/30 * * * *', 'UTC') instanceof Date);
  });
});

describe('usage limits', () => {
  test('platform defaults come from env, with safe fallbacks', () => {
    const d = platformDefaultLimits({ AI_DEFAULT_DAILY_BUDGET_USD: '2', AI_DEFAULT_MONTHLY_BUDGET_USD: 'unlimited' });
    assert.equal(d.dailyBudgetUsd, 2);
    assert.equal(d.monthlyBudgetUsd, null);
    assert.equal(platformDefaultLimits({}).dailyBudgetUsd, 5, 'budgeted by default');
    assert.equal(platformDefaultLimits({ AI_DEFAULT_MAX_TASK_STEPS: 'abc' }).maxTaskSteps, 8);
  });

  test('tenant overrides apply but can never exceed platform ceilings', () => {
    const merged = mergeLimits(platformDefaultLimits({}), {
      tenantId: 't',
      aiEnabled: true,
      monthlyBudgetUsd: null,
      dailyBudgetUsd: null,
      maxTaskCostUsd: null,
      maxTaskSteps: 999,
      maxConcurrentTasks: 999,
      maxTasksPerDay: null,
      maxSchedules: null,
      updatedByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    assert.equal(merged.maxTaskSteps, 30);
    assert.equal(merged.maxConcurrentTasks, 20);
    assert.equal(merged.dailyBudgetUsd, 5, 'null column = platform default, not unlimited');
  });
});

describe('configuration safety', () => {
  const good = {
    DATABASE_URL: 'postgresql://x',
    JWT_ACCESS_SECRET: 'a'.repeat(40),
    JWT_REFRESH_SECRET: 'b'.repeat(40),
    CREDENTIALS_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  };

  test('missing secrets are fatal', () => {
    const problems = validateEnv({ DATABASE_URL: 'x' });
    assert.ok(problems.some((p) => p.key === 'JWT_ACCESS_SECRET'));
    assert.ok(problems.some((p) => p.key === 'CREDENTIALS_ENCRYPTION_KEY'));
  });

  test('placeholder secrets are rejected in production', () => {
    const p = validateEnv({ ...good, NODE_ENV: 'production', JWT_ACCESS_SECRET: 'change-me-access-secret' });
    assert.ok(p.some((x) => x.key === 'JWT_ACCESS_SECRET'));
    assert.ok(p.some((x) => x.key === 'WEBHOOK_SIGNING_SECRET'));
  });

  test('a complete dev config passes', () => {
    assert.deepEqual(validateEnv(good), []);
  });

  test('default AI model is configurable per deployment', () => {
    assert.deepEqual(platformDefaultModel({ AI_DEFAULT_PROVIDER: 'anthropic', AI_DEFAULT_MODEL: 'claude-sonnet-5-5' }), {
      provider: 'ANTHROPIC',
      model: 'claude-sonnet-5-5',
    });
    assert.equal(platformDefaultModel({}).provider, 'GEMINI');
  });
});

describe('webhook signatures', () => {
  test('accepts only an exact HMAC over the raw body', () => {
    const body = Buffer.from('{"a":1}');
    const sig = createHmac('sha256', 'k').update(body).digest('hex');
    assert.ok(verifyHmacSignature(body, `sha256=${sig}`, 'k', 'sha256'));
    assert.ok(!verifyHmacSignature(Buffer.from('{"a":2}'), `sha256=${sig}`, 'k', 'sha256'));
    assert.ok(!verifyHmacSignature(body, sig, 'other', 'sha256'));
    assert.ok(!verifyHmacSignature(body, undefined, 'k', 'sha256'));
    assert.ok(!verifyHmacSignature(body, 'zz', 'k', 'sha256'));
  });
});
