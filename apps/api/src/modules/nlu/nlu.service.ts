import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { nluConfig } from './nlu.config';
import { decide } from './nlu-policy';
import { RasaClient } from './rasa.client';
import type { FallbackReason, NluContext, NluDecision, NluTrace } from './nlu.types';

/** Light normalisation for the model; the original text is never replaced. */
export function normalizeForNlu(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, 500);
}

export function traceOf(decision: NluDecision, ms?: number): NluTrace {
  return decision.path === 'rasa'
    ? { path: 'rasa', intent: decision.intent, confidence: round(decision.confidence), ms }
    : { path: 'llm', reason: decision.reason, intent: decision.intent, confidence: decision.confidence === undefined ? undefined : round(decision.confidence), ms };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Rasa first: classify the customer's message and decide whether a supported
 * intent can be routed without the router LLM. Never throws: any problem
 * (Rasa off, down, slow, confused) becomes an "llm" decision with a reason.
 */
@Injectable()
export class NluService {
  private readonly logger = new Logger(NluService.name);
  private readonly counters = { requests: 0, rasaHandled: 0, llmFallback: 0, rasaErrors: 0 };

  constructor(
    private readonly rasa: RasaClient,
    private readonly prisma: PrismaService,
  ) {}

  async classify(text: string, ctx: NluContext = {}, signal?: AbortSignal): Promise<{ decision: NluDecision; trace: NluTrace }> {
    const cfg = nluConfig();
    const started = Date.now();
    this.counters.requests += 1;

    const done = (decision: NluDecision) => {
      const ms = Date.now() - started;
      if (decision.path === 'rasa') this.counters.rasaHandled += 1;
      else this.counters.llmFallback += 1;
      // Intent, score and route only; never the message text.
      this.logger.debug({ msg: 'nlu_route', path: decision.path, intent: decision.intent, confidence: decision.confidence, reason: decision.path === 'llm' ? decision.reason : undefined, ms });
      return { decision, trace: traceOf(decision, ms) };
    };

    if (!cfg.enabled || ctx.enabled === false) return done({ path: 'llm', reason: 'disabled' });
    const input = normalizeForNlu(text);
    if (!input) return done({ path: 'llm', reason: 'low_confidence' });

    try {
      const parse = await this.rasa.parse(input, signal);
      return done(decide(parse, input, ctx, cfg));
    } catch (err) {
      this.counters.rasaErrors += 1;
      this.logger.warn({ msg: 'rasa_unavailable', error: (err as Error).message });
      return done({ path: 'llm', reason: 'rasa_unavailable' });
    }
  }

  /** Process-level counters since start (per server). */
  snapshot() {
    const cfg = nluConfig();
    return { enabled: cfg.enabled, ...this.counters };
  }

  /**
   * Durable numbers for one business, from the `nlu` trace stored on each
   * automatic reply: how many replies skipped the router LLM and why the rest
   * did not.
   */
  async stats(tenantId: string, days = 30) {
    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await this.prisma.$queryRaw<
      { path: string; reason: string | null; intent: string | null; n: number; avg_conf: number | null; avg_ms: number | null }[]
    >`SELECT metadata->'nlu'->>'path' AS path, metadata->'nlu'->>'reason' AS reason, metadata->'nlu'->>'intent' AS intent,
             count(*)::int AS n, avg((metadata->'nlu'->>'confidence')::float) AS avg_conf, avg((metadata->'nlu'->>'ms')::float) AS avg_ms
      FROM messages
      WHERE "tenantId" = ${tenantId} AND "createdAt" >= ${since} AND metadata ? 'nlu'
      GROUP BY 1, 2, 3`;

    const total = rows.reduce((a, r) => a + r.n, 0);
    const rasa = rows.filter((r) => r.path === 'rasa');
    const llm = rows.filter((r) => r.path === 'llm');
    const sum = (rs: typeof rows) => rs.reduce((a, r) => a + r.n, 0);
    const by = (rs: typeof rows, key: 'intent' | 'reason') => {
      const m = new Map<string, number>();
      for (const r of rs) m.set(r[key] ?? 'unknown', (m.get(r[key] ?? 'unknown') ?? 0) + r.n);
      return Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]));
    };
    const avg = (rs: typeof rows, f: 'avg_conf' | 'avg_ms') => {
      const n = sum(rs.filter((r) => r[f] !== null));
      return n ? rs.reduce((a, r) => a + (r[f] ?? 0) * (r[f] === null ? 0 : r.n), 0) / n : null;
    };
    const routerCallsAvoided = sum(rasa);
    return {
      days,
      replies: total,
      handledByRasa: routerCallsAvoided,
      sentToLlm: sum(llm),
      rasaShare: total ? routerCallsAvoided / total : 0,
      /** Each Rasa-handled reply skipped the per-message router LLM call. */
      routerCallsAvoided,
      byIntent: by(rasa, 'intent'),
      fallbackReasons: by(llm, 'reason'),
      avgConfidence: avg(rasa, 'avg_conf'),
      avgLatencyMs: { rasa: avg(rasa, 'avg_ms'), llm: avg(llm, 'avg_ms') },
      process: this.snapshot(),
    };
  }
}
