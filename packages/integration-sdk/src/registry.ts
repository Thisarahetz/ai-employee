import type { ActionDefinition } from './types';

/** In-memory registry of actions this process has registered. Process-lifetime only. */
const registry = new Map<string, ActionDefinition>();

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
