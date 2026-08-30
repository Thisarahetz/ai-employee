/**
 * Integration API Contract types.
 *
 * This is the wire contract every external business system implements (directly, or
 * via `packages/integration-sdk`) so AI Employee can discover and call its actions.
 * Full narrative + JSON examples: `docs/integration-api-contract.md`.
 *
 *   GET  /ai/actions   -> DiscoverActionsResponse
 *   POST /ai/execute   -> ExecuteActionResponse   (body: ExecuteActionRequest)
 *   GET  /ai/knowledge -> SyncKnowledgeResponse   (optional — reference docs + locations for the Knowledge Agent)
 *
 * `IntegrationAction.parameters` (see `prisma/schema.prisma`, typed here in
 * `entities.ts`) stores exactly the shape of `ActionDefinitionDto['parameters']`.
 */

/** A single parameter's JSON-schema-like definition, as declared by an external action. */
export interface ActionParameterSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  required?: boolean;
  /** Allowed values, for string/number enums. */
  enum?: Array<string | number>;
  /** Element schema, when `type` is `'array'`. */
  items?: ActionParameterSchema;
  /** Field schemas, when `type` is `'object'`. */
  properties?: Record<string, ActionParameterSchema>;
  default?: unknown;
}

/** One action an external system exposes to AI Employee, as returned by `GET /ai/actions`. */
export interface ActionDefinitionDto {
  name: string;
  description: string;
  parameters: Record<string, ActionParameterSchema>;
}

/** Response body of `GET /ai/actions`. */
export interface DiscoverActionsResponse {
  actions: ActionDefinitionDto[];
}

/** Request body of `POST /ai/execute`. Send an `Idempotency-Key` header alongside it. */
export interface ExecuteActionRequest {
  action: string;
  data: Record<string, unknown>;
}

/** Response body of `POST /ai/execute`, and the general AI Employee result envelope. */
export interface ExecuteActionResponse {
  success: boolean;
  message: string;
  data?: unknown;
}

/**
 * One reference document an external system exposes to AI Employee's Knowledge Agent
 * via `GET /ai/knowledge` — e.g. a services & pricing list, opening hours, or policies.
 * AI Employee chunks + embeds `content` into a dedicated KnowledgeBase and re-syncs
 * (upserting on `externalId`) whenever the operator triggers a sync.
 */
export interface KnowledgeDocumentDto {
  /** Stable identifier for this document within the integration; AI Employee upserts on it. */
  externalId: string;
  /** Human-readable title, shown in the Knowledge Base UI. */
  title: string;
  /** The document body — plain text or Markdown. This is what gets chunked, embedded and retrieved. */
  content: string;
  /** Hint for how `content` is formatted. Defaults to `'text'`. */
  format?: 'text' | 'markdown';
}

/**
 * One physical location / branch an external system exposes via `GET /ai/knowledge`.
 * AI Employee upserts each into a `Business` (Location) record keyed on `externalId`, so
 * operators never re-enter locations that already exist in their business system.
 * Locations dropped from the feed are left in place (they may have channels /
 * conversations attached), not deleted.
 */
export interface KnowledgeLocationDto {
  /** Stable identifier for this location within the integration; AI Employee upserts on it. */
  externalId: string;
  /** Location name — mirrored verbatim onto the AI Employee Location record. */
  name: string;
  /** IANA timezone, e.g. `America/New_York`. */
  timezone?: string;
  /** One-line formatted address for display / customer answers. */
  address?: string;
  phone?: string;
}

/** Response body of `GET /ai/knowledge`. */
export interface SyncKnowledgeResponse {
  documents: KnowledgeDocumentDto[];
  /** Optional: physical locations / branches to mirror into AI Employee Location records. */
  locations?: KnowledgeLocationDto[];
}
