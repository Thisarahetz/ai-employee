/**
 * Retry policy for AI workforce tasks. Pure functions so they are unit-tested
 * without a database or queue.
 */

/** Provider/network errors that are worth retrying later. */
export const TRANSIENT_ERROR =
  /\b(408|425|429|500|502|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand|rate.?limit|timed? ?out|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|fetch failed|network/i;

export function isTransientError(err: unknown): boolean {
  const msg = (err as Error)?.message ?? String(err ?? '');
  return TRANSIENT_ERROR.test(msg);
}

/** Thrown when a task stops because of a tenant/task safety limit. Never retried automatically. */
export class LimitReachedError extends Error {
  readonly limit = true;
  constructor(message: string) {
    super(message);
    this.name = 'LimitReachedError';
  }
}

export const isLimitError = (err: unknown): err is LimitReachedError => !!err && (err as LimitReachedError).limit === true;

/** In-call retries for a single provider request (short, while the worker holds the task). */
export const AI_CALL_RETRY_DELAYS_MS = [2000, 6000, 15000];

/**
 * Delay before the task-level retry number `attempt` (1-based count of attempts
 * already made). 30s, 2m, 8m, 32m … capped at 1h, with ±20% jitter so many
 * tenants hitting the same provider outage don't retry in lockstep.
 */
export function retryDelayMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(60 * 60_000, 30_000 * 4 ** Math.max(0, attempt - 1));
  const jitter = 0.8 + random() * 0.4;
  return Math.round(base * jitter);
}

/** Longest we will wait on a provider's own "retry after" hint. */
export const MAX_PROVIDER_RETRY_DELAY_MS = 6 * 60 * 60_000;

/**
 * Reads a provider's retry hint from an error message: Gemini's
 * `"retryDelay":"4564s"` / "Please retry in 1h16m4.5s", or "Retry-After: 120".
 */
export function providerRetryAfterMs(err: unknown): number | null {
  const msg = (err as Error)?.message ?? String(err ?? '');
  const delay = msg.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  if (delay) return Math.round(Number(delay[1]) * 1000);
  const human = msg.match(/retry in\s+((?:\d+(?:\.\d+)?[hms]\s*)+)/i);
  if (human) {
    let ms = 0;
    for (const [, n, unit] of human[1]!.matchAll(/(\d+(?:\.\d+)?)([hms])/g)) ms += Number(n) * (unit === 'h' ? 3600e3 : unit === 'm' ? 60e3 : 1e3);
    return ms > 0 ? Math.round(ms) : null;
  }
  const after = msg.match(/retry-after\s*[:=]\s*(\d+)/i);
  return after ? Number(after[1]) * 1000 : null;
}

export type FailureDecision =
  | { action: 'RETRY'; delayMs: number }
  | { action: 'FAIL' }
  | { action: 'BLOCK' };

/** What to do with a task whose attempt just failed. */
export function decideOnFailure(err: unknown, attempts: number, maxAttempts: number): FailureDecision {
  if (isLimitError(err)) return { action: 'BLOCK' };
  if (isTransientError(err) && attempts < maxAttempts) {
    // Respect the provider's own hint (e.g. a quota that resets in an hour) so
    // retries aren't burnt before it can possibly succeed.
    const hint = providerRetryAfterMs(err);
    const delayMs = Math.min(MAX_PROVIDER_RETRY_DELAY_MS, Math.max(retryDelayMs(attempts), (hint ?? 0) + 5_000));
    return { action: 'RETRY', delayMs };
  }
  return { action: 'FAIL' };
}

/** Stops a model that keeps issuing the exact same call (a classic agent loop). */
export class RepeatedCallGuard {
  private readonly counts = new Map<string, number>();
  constructor(private readonly max = 3) {}

  /** Returns true when this call has now been seen more than `max` times. */
  record(name: string, args: unknown): boolean {
    const key = `${name}:${stableStringify(args)}`;
    const n = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, n);
    return n > this.max;
  }
}

export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'undefined';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  return `{${Object.keys(v as Record<string, unknown>)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`)
    .join(',')}}`;
}
