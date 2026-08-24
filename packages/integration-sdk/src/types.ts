/**
 * Shared types for @ai-employee/integration-sdk.
 * Mirrors the "AI Employee Integration API Contract" (see docs/integration-api-contract.md):
 *
 *   GET  {baseUrl}/ai/actions  -> ListActionsResponse
 *   POST {baseUrl}/ai/execute  -> ExecuteActionResponse
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
