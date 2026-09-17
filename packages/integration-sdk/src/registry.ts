import { validateActionData } from './validation';
import type {
  ActionDefinition,
  ExecutionContext,
  ExecuteActionResponse,
  IntegrationAuthOptions,
  IntegrationHttpRequest,
  IntegrationHttpResponse,
  KnowledgeProvider,
  ListActionsResponse,
  ListKnowledgeResponse,
} from './types';

/** In-memory registry of actions this process has registered. Process-lifetime only. */
const registry = new Map<string, ActionDefinition>();

/** Optional single provider for the GET /ai/knowledge feed. Process-lifetime only. */
let knowledgeProvider: KnowledgeProvider | null = null;

/**
 * Registers (or overwrites) an action so it is:
 *  - listed by GET /ai/actions (via Express, NestJS, or standalone handlers)
 *  - callable via POST /ai/execute { action: name, data }
 */
export function registerAction(definition: ActionDefinition): void {
  if (!definition || !definition.name) {
    throw new Error('registerAction: `name` is required');
  }
  if (typeof definition.handler !== 'function') {
    throw new Error(`registerAction: "${definition.name}" is missing a handler function`);
  }
  registry.set(definition.name, {
    ...definition,
    parameters: definition.parameters ?? {},
  });
}

/** Removes a previously registered action, if any. Mostly useful in tests. */
export function unregisterAction(name: string): void {
  registry.delete(name);
}

/** Returns all currently registered actions, including their handlers. */
export function getRegisteredActions(): ActionDefinition[] {
  return Array.from(registry.values());
}

/** Formats all registered actions into the standard ListActionsResponse shape. */
export function listRegisteredActionsResponse(): ListActionsResponse {
  return {
    actions: getRegisteredActions().map(({ name, description, parameters, reversibility, compensateWith, compensationMapping }) => ({
      name,
      description,
      parameters,
      reversibility: reversibility ?? (name.startsWith('get_') || name.startsWith('check_') || name.startsWith('list_') ? 'QUERY' : 'COMPENSATABLE'),
      compensateWith,
      compensationMapping,
    })),
  };
}

/** Looks up a single registered action by name. */
export function getRegisteredAction(name: string): ActionDefinition | undefined {
  return registry.get(name);
}

/** Clears all registered actions. Exposed for test isolation between suites. */
export function clearRegisteredActions(): void {
  registry.clear();
}

/**
 * Registers (or replaces) the provider backing GET /ai/knowledge — the reference
 * documents (services & pricing, hours, policies) and locations AI Employee answers from.
 * Pass `null` to unregister.
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
 * Invokes the knowledge provider (if any) and normalizes its result into the wire shape
 * for GET /ai/knowledge. Returns `{ documents: [], locations: [] }` when none is registered.
 */
export async function resolveKnowledgeResponse(): Promise<ListKnowledgeResponse> {
  if (!knowledgeProvider) return { documents: [], locations: [] };
  try {
    const result = await knowledgeProvider();
    if (Array.isArray(result)) return { documents: result, locations: [] };
    return { documents: result.documents ?? [], locations: result.locations ?? [] };
  } catch (error) {
    return { documents: [], locations: [] };
  }
}

/** Clears the knowledge provider. Exposed for test isolation between suites. */
export function clearRegisteredKnowledge(): void {
  knowledgeProvider = null;
}

/**
 * Directly executes a registered action by name:
 * 1. Looks up the action definition in the registry.
 * 2. Validates incoming parameters against the action's schema.
 * 3. Executes the handler and packages the output into standard ExecuteActionResponse.
 */
export async function executeRegisteredAction(
  actionName: string,
  data: Record<string, unknown> = {},
  context?: ExecutionContext,
): Promise<ExecuteActionResponse> {
  const definition = getRegisteredAction(actionName);

  if (!definition) {
    return {
      success: false,
      message: `Unknown action "${actionName}"`,
    };
  }

  // 1. Parameter Validation
  const validation = validateActionData(definition, data);
  if (!validation.valid) {
    return {
      success: false,
      message: validation.error || `Invalid parameters for action "${actionName}"`,
    };
  }

  // 2. Execution
  try {
    const result = await definition.handler(data, context);

    // If the handler explicitly returned an object with success: false
    if (result && typeof result === 'object' && 'success' in result && (result as any).success === false) {
      return {
        success: false,
        message: (result as any).message || `${actionName} execution failed`,
        data: (result as any).data,
      };
    }

    return {
      success: true,
      message: `${actionName} executed successfully`,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Evaluates configured authentication options against an incoming request or headers.
 */
export async function checkAuth(
  options?: IntegrationAuthOptions,
  reqOrHeaders?: any,
): Promise<boolean> {
  if (!options) return true;

  // Custom verifier hook
  if (typeof options.verifyAuth === 'function') {
    const isAuthed = await options.verifyAuth(reqOrHeaders);
    if (!isAuthed) return false;
  }

  // Normalize headers extraction
  const headers = reqOrHeaders?.headers ?? reqOrHeaders ?? {};
  const getHeader = (name: string): string | undefined => {
    const direct = headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()];
    return Array.isArray(direct) ? direct[0] : direct;
  };

  // API Key check
  if (options.apiKey) {
    const headerName = options.apiKeyHeader || 'x-api-key';
    const providedKey = getHeader(headerName);
    if (providedKey !== options.apiKey) {
      return false;
    }
  }

  // Bearer Token check
  if (options.bearerToken) {
    const authHeader = getHeader('authorization') || getHeader('Authorization');
    const expected = `Bearer ${options.bearerToken}`;
    if (!authHeader || authHeader.trim() !== expected) {
      return false;
    }
  }

  return true;
}

/**
 * Framework-agnostic HTTP handler for Next.js API routes, Fastify, Hono, AWS Lambda, Cloudflare Workers, etc.
 */
export async function handleIntegrationRequest(
  req: IntegrationHttpRequest,
  options?: IntegrationAuthOptions,
): Promise<IntegrationHttpResponse> {
  const method = (req.method || 'GET').toUpperCase();
  const rawPath = req.path || '';
  const cleanPath = rawPath.replace(/^\/ai/, '').replace(/\/$/, '') || '/';

  // Verify authentication if configured
  const isAuthorized = await checkAuth(options, req);
  if (!isAuthorized) {
    return {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
      body: { success: false, message: 'Unauthorized' },
    };
  }

  // Route: GET /actions or /ai/actions
  if (method === 'GET' && (cleanPath === '/actions' || cleanPath === '')) {
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: listRegisteredActionsResponse(),
    };
  }

  // Route: GET /knowledge or /ai/knowledge
  if (method === 'GET' && cleanPath === '/knowledge') {
    const knowledge = await resolveKnowledgeResponse();
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: knowledge,
    };
  }

  // Route: POST /execute or /ai/execute
  if (method === 'POST' && cleanPath === '/execute') {
    const body = (req.body ?? {}) as { action?: string; data?: Record<string, unknown> };
    const actionName = body.action;

    if (!actionName || typeof actionName !== 'string') {
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { success: false, message: 'Missing or invalid "action" in request body' },
      };
    }

    const idempotencyKey =
      (req.headers?.['idempotency-key'] as string) ||
      (req.headers?.['Idempotency-Key'] as string) ||
      (req.headers?.['x-idempotency-key'] as string);

    const context: ExecutionContext = {
      idempotencyKey,
      headers: req.headers as Record<string, string | string[] | undefined>,
      rawRequest: req,
    };

    const response = await executeRegisteredAction(actionName, body.data ?? {}, context);
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: response,
    };
  }

  return {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
    body: { success: false, message: `Route not found: ${method} ${rawPath}` },
  };
}
