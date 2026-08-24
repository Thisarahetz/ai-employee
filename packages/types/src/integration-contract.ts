/**
 * Integration API Contract types.
 *
 * This is the wire contract every external business system implements (directly, or
 * via `packages/integration-sdk`) so AI Employee can discover and call its actions.
 * Full narrative + JSON examples: `docs/integration-api-contract.md`.
 *
 *   GET  /ai/actions   -> DiscoverActionsResponse
 *   POST /ai/execute   -> ExecuteActionResponse   (body: ExecuteActionRequest)
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
