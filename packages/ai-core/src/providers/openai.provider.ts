import OpenAI from 'openai';
import type {
  AIProvider,
  AICompletionRequest,
  AICompletionResult,
  AIEmbeddingResult,
  AIMessage,
  AIToolCall,
} from '../types';

const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

/**
 * OpenAIProvider — wraps the `openai` SDK behind the AIProvider interface.
 *
 * The API key is read lazily, on first actual call, rather than in the
 * constructor. This lets provider-factory eagerly instantiate/cache both
 * providers without requiring both OPENAI_API_KEY and ANTHROPIC_API_KEY to be
 * set — only the provider a tenant is actually configured to use needs its
 * key present.
 */
export class OpenAIProvider implements AIProvider {
  readonly name = 'openai' as const;

  private client: OpenAI | null = null;

  /** Explicit key (a business's own key); falls back to the platform env key. */
  constructor(private readonly apiKey?: string) {}

  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = this.apiKey ?? process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error(
          'OPENAI_API_KEY is not set — cannot call the OpenAI provider. Set it in your environment (see .env.example).',
        );
      }
      this.client = new OpenAI({
        apiKey,
        organization: process.env.OPENAI_ORG_ID || undefined,
      });
    }
    return this.client;
  }

  async complete(req: AICompletionRequest): Promise<AICompletionResult> {
    const client = this.getClient();

    const response = await client.chat.completions.create({
      model: req.model,
      messages: this.toOpenAiMessages(req.messages),
      temperature: req.temperature,
      max_tokens: req.maxTokens,
      tools: req.tools?.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      })),
      // NOTE: OpenAI's json_object mode requires the word "json" to appear
      // somewhere in the prompt — callers passing responseFormat: 'json'
      // should mention JSON in their system/user prompt.
      response_format: req.responseFormat === 'json' ? { type: 'json_object' } : undefined,
    });

    const choice = response.choices[0];
    const message = choice?.message;

    const toolCalls: AIToolCall[] =
      message?.tool_calls
        ?.filter((tc): tc is Extract<typeof tc, { type: 'function' }> => tc.type === 'function')
        .map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          arguments: this.parseArguments(tc.function.arguments),
        })) ?? [];

    return {
      content: message?.content ?? '',
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      model: response.model,
    };
  }

  async embed(text: string, model = DEFAULT_EMBEDDING_MODEL): Promise<AIEmbeddingResult> {
    const client = this.getClient();
    const response = await client.embeddings.create({ model, input: text });

    return {
      embedding: response.data[0]?.embedding ?? [],
      tokenCount: response.usage?.total_tokens ?? 0,
      model: response.model ?? model,
    };
  }

  private toOpenAiMessages(messages: AIMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
    return messages.map((m) => {
      if (m.role === 'tool') {
        return {
          role: 'tool',
          content: m.content,
          tool_call_id: m.toolCallId ?? '',
        };
      }
      return { role: m.role, content: m.content } as OpenAI.Chat.ChatCompletionMessageParam;
    });
  }

  private parseArguments(raw: string): Record<string, unknown> {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}
