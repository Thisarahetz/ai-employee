/**
 * Shared types for @ai-employee/integration-sdk.
 * Mirrors the "AI Employee Integration API Contract" (see docs/integration-api-contract.md):
 *
 *   GET  {baseUrl}/ai/actions    -> ListActionsResponse
 *   POST {baseUrl}/ai/execute    -> ExecuteActionResponse
 *   GET  {baseUrl}/ai/knowledge  -> ListKnowledgeResponse  (optional)
 */

export interface ActionParameter {
  /** Free-form type hint, e.g. "string" | "number" | "boolean" | "date". Not enforced by the SDK. */
  type: string;
  required: boolean;
  description?: string;
}

export interface ActionDefinition {
  name: string;
  description: string;
  parameters: Record<string, ActionParameter>;
  /** Your business logic. Return value is echoed back as `data` in ExecuteActionResponse. */
  handler: (data: Record<string, unknown>) => Promise<unknown>;
}

/** Public shape of a registered action, as exposed over GET /ai/actions (handler omitted). */
export interface ActionSummary {
  name: string;
  description: string;
  parameters: Record<string, ActionParameter>;
}

export interface ListActionsResponse {
  actions: ActionSummary[];
}

export interface ExecuteActionRequest {
  action: string;
  data: Record<string, unknown>;
}

export interface ExecuteActionResponse {
  success: boolean;
  message: string;
  data?: unknown;
}

/**
 * A reference document exposed to AI Employee's Knowledge Agent via GET /ai/knowledge —
 * e.g. a services & pricing list, opening hours, or return policy. AI Employee chunks,
 * embeds and retrieves `content`, and re-syncs (upserting on `externalId`) on demand.
 */
export interface KnowledgeDocument {
  /** Stable identifier for this document within your system; AI Employee upserts on it. */
  externalId: string;
  title: string;
  /** Plain text or Markdown body. */
  content: string;
  format?: 'text' | 'markdown';
}

/**
 * A physical location / branch exposed via GET /ai/knowledge. AI Employee mirrors each
 * into a Location record, keyed on `externalId`. Locations dropped from the feed are
 * left in place, not deleted.
 */
export interface KnowledgeLocation {
  /** Stable identifier for this location within your system; AI Employee upserts on it. */
  externalId: string;
  /** Location name — mirrored verbatim onto the AI Employee Location record. */
  name: string;
  /** IANA timezone, e.g. `America/New_York`. */
  timezone?: string;
  /** One-line formatted address. */
  address?: string;
  phone?: string;
}

/** Full GET /ai/knowledge payload: reference documents plus optional physical locations. */
export interface KnowledgeFeed {
  documents: KnowledgeDocument[];
  locations?: KnowledgeLocation[];
}

/**
 * Builds the current GET /ai/knowledge payload. Called per request, so cache inside it
 * if the source is expensive. Return a bare `KnowledgeDocument[]` for the common
 * documents-only case, or a `KnowledgeFeed` to also sync locations.
 */
export type KnowledgeProvider = () =>
  | KnowledgeDocument[]
  | KnowledgeFeed
  | Promise<KnowledgeDocument[] | KnowledgeFeed>;

export interface ListKnowledgeResponse {
  documents: KnowledgeDocument[];
  locations: KnowledgeLocation[];
}
