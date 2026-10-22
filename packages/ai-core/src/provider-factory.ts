import { createHash } from 'node:crypto';
import type { AIProvider, AIProviderName } from './types';
import { OpenAIProvider } from './providers/openai.provider';
import { ClaudeProvider } from './providers/anthropic.provider';
import { GeminiProvider } from './providers/gemini.provider';

const cache = new Map<AIProviderName, AIProvider>();

/**
 * Lazily instantiates and caches a singleton AIProvider per provider name.
 * Providers read their API key from process.env at first-call time (not at
 * construction), so calling getProvider() for a provider whose key isn't
 * set is safe — it only throws once complete()/embed() is actually invoked.
 */
export function getProvider(name: AIProviderName): AIProvider {
  const cached = cache.get(name);
  if (cached) return cached;

  let provider: AIProvider;
  switch (name) {
    case 'openai':
      provider = new OpenAIProvider();
      break;
    case 'anthropic':
      provider = new ClaudeProvider();
      break;
    case 'gemini':
      provider = new GeminiProvider();
      break;
    default: {
      const exhaustive: never = name;
      throw new Error(`Unknown AI provider: ${String(exhaustive)}`);
    }
  }

  cache.set(name, provider);
  return provider;
}

const keyed = new Map<string, AIProvider>();
const MAX_KEYED = 500;

/**
 * Provider bound to a specific API key (a business's own key). Clients are
 * cached per key hash — the key itself is never used as a map key.
 */
export function createProviderWithKey(name: AIProviderName, apiKey: string): AIProvider {
  const id = `${name}:${createHash('sha256').update(apiKey).digest('hex')}`;
  const hit = keyed.get(id);
  if (hit) return hit;
  let provider: AIProvider;
  switch (name) {
    case 'openai':
      provider = new OpenAIProvider(apiKey);
      break;
    case 'anthropic':
      provider = new ClaudeProvider(apiKey);
      break;
    case 'gemini':
      provider = new GeminiProvider(apiKey);
      break;
    default: {
      const exhaustive: never = name;
      throw new Error(`Unknown AI provider: ${String(exhaustive)}`);
    }
  }
  if (keyed.size >= MAX_KEYED) keyed.delete(keyed.keys().next().value as string);
  keyed.set(id, provider);
  return provider;
}
