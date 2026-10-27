/**
 * Rasa-first routing settings, read from the environment on every call so
 * they can be tuned (and tested) without a rebuild.
 */
export interface NluConfig {
  enabled: boolean;
  baseUrl: string;
  token: string;
  timeoutMs: number;
  /** At or above this (and a clear margin) a supported intent is routed without the router LLM. */
  highConfidence: number;
  /** Cancel / reschedule need a stricter bar; confidence never authorizes them on its own. */
  highRiskConfidence: number;
  /** Below this the intent is ignored; between low and high the LLM interprets. */
  lowConfidence: number;
  /** Required gap between the top two intents. */
  minMargin: number;
  /** Fixed replies (greeting/thanks/goodbye) only for messages up to this many words. */
  templateMaxWords: number;
  breakerFailures: number;
  breakerCooldownMs: number;
}

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return v !== undefined && v.trim() !== '' && Number.isFinite(n) ? n : d;
};

export function nluConfig(env: NodeJS.ProcessEnv = process.env): NluConfig {
  return {
    // On whenever a Rasa URL is configured; RASA_ENABLED=false is an emergency off-switch for the whole platform.
    enabled: (env.RASA_ENABLED ?? 'true').toLowerCase() !== 'false' && !!env.RASA_BASE_URL?.trim(),
    baseUrl: (env.RASA_BASE_URL ?? '').replace(/\/+$/, ''),
    token: env.RASA_AUTH_TOKEN ?? '',
    timeoutMs: num(env.RASA_TIMEOUT_MS, 1500),
    highConfidence: num(env.RASA_HIGH_CONFIDENCE, 0.8),
    highRiskConfidence: num(env.RASA_HIGH_RISK_CONFIDENCE, 0.92),
    lowConfidence: num(env.RASA_LOW_CONFIDENCE, 0.5),
    minMargin: num(env.RASA_MIN_MARGIN, 0.15),
    templateMaxWords: num(env.RASA_TEMPLATE_MAX_WORDS, 6),
    breakerFailures: num(env.RASA_BREAKER_FAILURES, 3),
    breakerCooldownMs: num(env.RASA_BREAKER_COOLDOWN_MS, 30_000),
  };
}
