export interface ModelCost {
  /** USD per 1,000 input tokens. */
  input: number;
  /** USD per 1,000 output tokens. */
  output: number;
}

/**
 * Approximate USD cost per 1,000 tokens, keyed by the exact model string
 * stored on AiConfiguration.model. Used by AiProviderService to populate
 * AiUsageLog.estimatedCostUsd for cost observability — these are
 * approximate, non-billing-accurate figures; revisit against each
 * provider's live pricing page periodically.
 */
export const MODEL_COSTS_USD_PER_1K: Record<string, ModelCost> = {
  // ── OpenAI ────────────────────────────────────────────────
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'text-embedding-3-small': { input: 0.00002, output: 0 },
  'text-embedding-3-large': { input: 0.00013, output: 0 },

  // ── Google Gemini ────────────────────────────────────────
  'gemini-3.7-flash': { input: 0.0003, output: 0.0025 },
  'gemini-3.6-flash': { input: 0.0003, output: 0.0025 },
  'gemini-3.5-flash': { input: 0.0003, output: 0.0025 },
  'gemini-3.5-flash-lite': { input: 0.0001, output: 0.0008 },
  'gemini-2.5-flash': { input: 0.0003, output: 0.0025 },
  'gemini-2.5-pro': { input: 0.00125, output: 0.01 },
  'gemini-embedding-001': { input: 0.00015, output: 0 },

  // ── Anthropic (current-generation) ───────────────────────
  'claude-opus-5': { input: 0.005, output: 0.025 },
  'claude-sonnet-5': { input: 0.003, output: 0.015 },
  'claude-haiku-4-5': { input: 0.001, output: 0.005 },
  // Prior-generation model strings some tenants may still be configured with.
  'claude-opus-4-6': { input: 0.005, output: 0.025 },
  'claude-sonnet-4-6': { input: 0.003, output: 0.015 },
};

/** Used when a model string isn't in the table above (unknown/new model). */
const DEFAULT_COST: ModelCost = { input: 0.002, output: 0.006 };

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens = 0,
): number {
  const cost = MODEL_COSTS_USD_PER_1K[model] ?? DEFAULT_COST;
  // Cached input tokens receive a 90% discount (Anthropic & OpenAI standard)
  const uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens);
  const inputCost = (uncachedInputTokens / 1000) * cost.input + (cachedInputTokens / 1000) * (cost.input * 0.1);
  const outputCost = (outputTokens / 1000) * cost.output;
  return Number((inputCost + outputCost).toFixed(6));
}
