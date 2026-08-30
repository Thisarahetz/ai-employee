import type { ActionDefinition, KnowledgeProvider, ListKnowledgeResponse } from './types';

/** In-memory registry of actions this process has registered. Process-lifetime only. */
const registry = new Map<string, ActionDefinition>();

/** Optional single provider for the GET /ai/knowledge feed. Process-lifetime only. */
let knowledgeProvider: KnowledgeProvider | null = null;

/**
 * Registers (or overwrites) an action so it is:
 *  - listed by GET /ai/actions (via the express or NestJS adapter)
 *  - callable via POST /ai/execute { action: name, data }
 */
export function registerAction(definition: ActionDefinition): void {
  if (!definition || !definition.name) {
    throw new Error('registerAction: `name` is required');
  }
  if (typeof definition.handler !== 'function') {
    throw new Error(`registerAction: "${definition.name}" is missing a handler function`);
  }
  registry.set(definition.name, definition);
}

/** Removes a previously registered action, if any. Mostly useful in tests. */
export function unregisterAction(name: string): void {
  registry.delete(name);
}

/** Returns all currently registered actions, including their handlers. */
export function getRegisteredActions(): ActionDefinition[] {
  return Array.from(registry.values());
}

/** Looks up a single registered action by name. */
export function getRegisteredAction(name: string): ActionDefinition | undefined {
  return registry.get(name);
}

/** Clears the registry. Exposed for test isolation between suites. */
export function clearRegisteredActions(): void {
  registry.clear();
}

/**
 * Registers (or replaces) the provider backing GET /ai/knowledge — the reference
 * documents (services & pricing, hours, policies) AI Employee's Knowledge Agent can
 * answer from. Pass `null` to unregister. Only one provider is kept; it's called on
 * every GET /ai/knowledge request, so keep it cheap or cache inside it.
 */
export function registerKnowledge(provider: KnowledgeProvider | null): void {
  if (provider !== null && typeof provider !== 'function') {
    throw new Error('registerKnowledge: provider must be a function or null');
  }
  knowledgeProvider = provider;
}

/** Returns the registered knowledge provider, if any. */
export function getKnowledgeProvider(): KnowledgeProvider | null {
  return knowledgeProvider;
}

/**
 * Invokes the knowledge provider (if any) and normalizes its result — a bare
 * `KnowledgeDocument[]` or a `KnowledgeFeed` — into the wire shape both adapters serve
 * for GET /ai/knowledge. Returns empty arrays when no provider is registered.
 */
export async function resolveKnowledgeResponse(): Promise<ListKnowledgeResponse> {
  if (!knowledgeProvider) return { documents: [], locations: [] };
  const result = await knowledgeProvider();
  if (Array.isArray(result)) return { documents: result, locations: [] };
  return { documents: result.documents ?? [], locations: result.locations ?? [] };
}

/** Clears the knowledge provider. Exposed for test isolation between suites. */
export function clearRegisteredKnowledge(): void {
  knowledgeProvider = null;
}
