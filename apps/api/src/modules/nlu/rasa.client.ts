import { Injectable, Logger } from '@nestjs/common';
import { nluConfig } from './nlu.config';
import type { RasaParse } from './nlu.types';

export class RasaUnavailableError extends Error {}

/**
 * Talks to the internal Rasa service (NLU only: POST /model/parse). Calls are
 * bounded by a timeout, never retried (a slow NLU must not slow a customer's
 * reply), and a circuit breaker skips Rasa for a short while after repeated
 * failures so an outage costs nothing per message.
 */
@Injectable()
export class RasaClient {
  private readonly logger = new Logger(RasaClient.name);
  private failures = 0;
  private openUntil = 0;

  async parse(text: string, signal?: AbortSignal): Promise<RasaParse> {
    const cfg = nluConfig();
    if (Date.now() < this.openUntil) throw new RasaUnavailableError('circuit open');

    const timeout = AbortSignal.timeout(cfg.timeoutMs);
    const url = `${cfg.baseUrl}/model/parse${cfg.token ? `?token=${encodeURIComponent(cfg.token)}` : ''}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      if (!res.ok) throw new RasaUnavailableError(`HTTP ${res.status}`);
      const parsed = this.validate(await res.json());
      this.failures = 0;
      return parsed;
    } catch (err) {
      // A caller that cancelled is not a Rasa failure.
      if (signal?.aborted) throw err;
      this.failures += 1;
      if (this.failures >= cfg.breakerFailures) {
        this.openUntil = Date.now() + cfg.breakerCooldownMs;
        this.logger.warn({ msg: 'rasa_circuit_open', failures: this.failures, cooldownMs: cfg.breakerCooldownMs });
      }
      throw err instanceof RasaUnavailableError ? err : new RasaUnavailableError((err as Error).message);
    }
  }

  /** Malformed responses count as an outage, never as an intent. */
  private validate(body: unknown): RasaParse {
    const b = body as {
      intent?: { name?: unknown; confidence?: unknown };
      intent_ranking?: { confidence?: unknown }[];
      entities?: { entity?: unknown; value?: unknown }[];
    };
    const name = b?.intent?.name;
    const confidence = b?.intent?.confidence;
    if (typeof name !== 'string' || typeof confidence !== 'number' || !Number.isFinite(confidence)) {
      throw new RasaUnavailableError('malformed response');
    }
    const second = b.intent_ranking?.[1]?.confidence;
    return {
      intent: name,
      confidence,
      runnerUp: typeof second === 'number' ? second : 0,
      entities: (b.entities ?? [])
        .filter((e) => typeof e.entity === 'string' && typeof e.value === 'string')
        .map((e) => ({ entity: e.entity as string, value: e.value as string })),
    };
  }

  /** For health checks and tests. */
  async isHealthy(): Promise<boolean> {
    const cfg = nluConfig();
    if (!cfg.baseUrl) return false;
    try {
      const res = await fetch(`${cfg.baseUrl}/version`, { signal: AbortSignal.timeout(cfg.timeoutMs) });
      return res.ok;
    } catch {
      return false;
    }
  }

  resetBreaker() {
    this.failures = 0;
    this.openUntil = 0;
  }
}
