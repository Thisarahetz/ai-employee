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
