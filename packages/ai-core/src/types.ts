/**
 * Provider-agnostic AI types. Every module in the platform that talks to an
 * LLM (ai-provider, ai-agent, rag, ...) depends on these shapes — never on
 * the OpenAI or Anthropic SDK types directly. This is what lets
 * AiProviderService swap providers per tenant/agent without touching any
 * calling code.
 */

export type AIProviderName = 'openai' | 'anthropic';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Set on role: 'tool' messages — the id of the tool_use/tool_call this is a result for. */
  toolCallId?: string;
}

/** JSON-schema-ish parameter definition — matches the Integration API Contract's action parameter format. */
export interface AIToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AIToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AICompletionRequest {
  model: string;
  messages: AIMessage[];
  temperature?: number;
  maxTokens?: number;
  tools?: AIToolDefinition[];
  responseFormat?: 'text' | 'json';
}

export interface AICompletionResult {
  content: string;
  toolCalls?: AIToolCall[];
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface AIEmbeddingResult {
  embedding: number[];
  tokenCount: number;
  model: string;
}

export interface AIProvider {
  readonly name: AIProviderName;
  complete(req: AICompletionRequest): Promise<AICompletionResult>;
  embed(text: string, model?: string): Promise<AIEmbeddingResult>;
}
