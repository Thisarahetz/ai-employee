import type { IdempotencyStore } from './idempotency';
export type { IdempotencyStore };

/**
 * Shared types for @ai-employee/integration-sdk.
 * Implements the AI Employee Integration API Contract (see docs/integration-api-contract.md):
 *
 *   GET  {baseUrl}/ai/actions    -> ListActionsResponse
 *   POST {baseUrl}/ai/execute    -> ExecuteActionResponse
 *   GET  {baseUrl}/ai/knowledge  -> ListKnowledgeResponse  (optional)
 */

export interface ActionParameter {
  /** Type hint, e.g. "string" | "number" | "boolean" | "date" | "object" | "array". */
  type: string;
  /** Whether the field is required for execution. */
  required: boolean;
  /** Human-readable explanation of the parameter for the AI agent. */
  description?: string;
}

export interface ExecutionContext {
  /** Value of the Idempotency-Key or x-idempotency-key header if provided. */
  idempotencyKey?: string;
  /** Normalized HTTP headers from the inbound request. */
  headers?: Record<string, string | string[] | undefined>;
  /** Raw framework request object (Express Request, Nest context, etc.). */
  rawRequest?: unknown;
}

export type ReversibilityType = 'QUERY' | 'COMPENSATABLE' | 'TERMINAL_IRREVERSIBLE';

export interface ActionDefinition {
  /** Unique name of the action, e.g. 'create_booking', 'check_inventory'. */
  name: string;
  /** Description telling the AI Employee when and how to call this action. */
  description: string;
  /** Schema mapping parameter names to their type, description, and required status. */
  parameters: Record<string, ActionParameter>;
  /** Reversibility semantic category under TEO-PIPS. Defaults to COMPENSATABLE (or QUERY if read-only). */
  reversibility?: ReversibilityType;
  /** Name of the compensating action that cancels or rolls back this action's effects. */
  compensateWith?: string;
  /** Mapping of output keys to compensation input keys (e.g. { appointmentId: 'appointmentId' }). */
  compensationMapping?: Record<string, string>;
  /**
   * Your business logic function.
   * Return value is serialized and returned as `data` in ExecuteActionResponse.
   */
  handler: (data: Record<string, any>, context?: ExecutionContext) => Promise<unknown> | unknown;
}

/** Public shape of a registered action exposed over GET /ai/actions. */
export interface ActionSummary {
  name: string;
  description: string;
  parameters: Record<string, ActionParameter>;
  reversibility?: ReversibilityType;
  compensateWith?: string;
  compensationMapping?: Record<string, string>;
}

export interface ListActionsResponse {
  actions: ActionSummary[];
}

export interface ExecuteActionRequest {
  action: string;
  data?: Record<string, unknown>;
}

export interface ExecuteActionResponse {
  success: boolean;
  message: string;
  data?: unknown;
}

/**
 * A reference document exposed to AI Employee's Knowledge Agent via GET /ai/knowledge —
 * e.g. services & pricing list, opening hours, or return policy. AI Employee chunks,
 * embeds, and retrieves `content` for RAG.
 */
export interface KnowledgeDocument {
  /** Stable identifier for this document within your system; AI Employee upserts on it. */
  externalId: string;
  /** Document title. */
  title: string;
  /** Plain text or Markdown body. */
  content: string;
  /** Body format hint. */
  format?: 'text' | 'markdown';
}

/**
 * A physical location / branch exposed via GET /ai/knowledge.
 * AI Employee mirrors each into a Location record keyed on `externalId`.
 */
export interface KnowledgeLocation {
  /** Stable identifier for this location within your system; AI Employee upserts on it. */
  externalId: string;
  /** Location name — mirrored onto the AI Employee Location record. */
  name: string;
  /** IANA timezone, e.g. 'America/New_York', 'Asia/Colombo'. */
  timezone?: string;
  /** One-line formatted address. */
  address?: string;
  /** Contact phone number. */
  phone?: string;
}

/** Full GET /ai/knowledge payload: reference documents plus optional physical locations. */
export interface KnowledgeFeed {
  documents: KnowledgeDocument[];
  locations?: KnowledgeLocation[];
}

/**
 * Function that produces the current GET /ai/knowledge payload.
 * Return a bare `KnowledgeDocument[]` for documents only, or `KnowledgeFeed` to also sync locations.
 */
export type KnowledgeProvider = () =>
  | KnowledgeDocument[]
  | KnowledgeFeed
  | Promise<KnowledgeDocument[] | KnowledgeFeed>;

export interface ListKnowledgeResponse {
  documents: KnowledgeDocument[];
  locations: KnowledgeLocation[];
}

/** Authentication verification options. */
export interface IntegrationAuthOptions {
  /** Expected API key. Checked against headers['x-api-key'] or custom header. */
  apiKey?: string;
  /** Custom header name for the API key (defaults to 'x-api-key'). */
  apiKeyHeader?: string;
  /** Expected Bearer token. Checked against Authorization: Bearer <token>. */
  bearerToken?: string;
  /** Custom auth verification callback. Return true if authorized, false otherwise. */
  verifyAuth?: (req: any) => boolean | Promise<boolean>;
}

/** Options for configuring the Express integration adapter. */
export interface ExpressAdapterOptions extends IntegrationAuthOptions {
  /** Idempotency store to cache responses by Idempotency-Key. Defaults to in-memory store. */
  idempotencyStore?: IdempotencyStore;
  /** Default TTL in seconds for idempotency cache entries (default: 86400 / 24h). */
  idempotencyTtlSeconds?: number;
  /** Whether to disable automatic idempotency caching. Default false. */
  disableIdempotency?: boolean;
}

/** Options for configuring the NestJS integration adapter. */
export interface NestAdapterOptions extends IntegrationAuthOptions {
  /** Idempotency store to cache responses by Idempotency-Key. */
  idempotencyStore?: IdempotencyStore;
  /** Default TTL in seconds for idempotency cache entries (default: 86400 / 24h). */
  idempotencyTtlSeconds?: number;
}

/** Generic HTTP request shape for framework-agnostic dispatchers (Next.js, Fastify, Hono, Lambda). */
export interface IntegrationHttpRequest {
  method: string;
  path?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
}

/** Generic HTTP response shape returned by framework-agnostic dispatchers. */
export interface IntegrationHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: ListActionsResponse | ExecuteActionResponse | ListKnowledgeResponse | { success: boolean; message: string };
}
