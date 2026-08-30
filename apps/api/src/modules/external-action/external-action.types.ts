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

/** One reference document as returned by an external system's optional GET /ai/knowledge. */
export interface DiscoveredKnowledgeDocument {
  externalId: string;
  title: string;
  content: string;
  format?: 'text' | 'markdown';
}

/** One physical location as returned by an external system's optional GET /ai/knowledge. */
export interface DiscoveredKnowledgeLocation {
  externalId: string;
  name: string;
  timezone?: string;
  address?: string;
  phone?: string;
}

/** Parsed GET /ai/knowledge payload. */
export interface DiscoveredKnowledgeFeed {
  documents: DiscoveredKnowledgeDocument[];
  locations: DiscoveredKnowledgeLocation[];
}
