/** One action as returned by an external system's GET /ai/actions. */
export interface DiscoveredAction {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Result of POST /ai/execute against an external system — never throws, always this shape. */
export interface ExecuteActionResult {
  success: boolean;
  message: string;
  data?: unknown;
}
