import Anthropic from '@anthropic-ai/sdk';
import type {
  AIProvider,
  AICompletionRequest,
  AICompletionResult,
  AIEmbeddingResult,
  AIMessage,
  AIToolCall,
} from '../types';

/**
 * ClaudeProvider — wraps @anthropic-ai/sdk behind the AIProvider interface.
 *
 * Anthropic's Messages API takes `system` as a top-level string/array field,
 * not a message with role "system" — so any role: 'system' entries in
 * req.messages are pulled out and joined into the top-level `system` field,
 * and the rest are mapped straight across.
 *
 * The API key is read lazily on first call (see getClient()), matching
 * OpenAIProvider, so importing/constructing this class never requires
 * ANTHROPIC_API_KEY to be set.
 */
export class ClaudeProvider implements AIProvider {
  readonly name = 'anthropic' as const;

  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (!this.client) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error(
          'ANTHROPIC_API_KEY is not set — cannot call the Anthropic provider. Set it in your environment (see .env.example).',
        );
      }
      this.client = new Anthropic({ apiKey });
    }
    return this.client;
  }

  async complete(req: AICompletionRequest): Promise<AICompletionResult> {
    const client = this.getClient();

    let systemText = req.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');

    // Anthropic has no forced-JSON response mode on this request shape —
    // nudge it via the system prompt instead when responseFormat: 'json' is
    // requested (matches how RouterAgentService asks for JSON output).
    if (req.responseFormat === 'json') {
      const jsonInstruction = 'Respond with valid JSON only — no prose, no markdown code fences.';
      systemText = systemText ? `${systemText}\n\n${jsonInstruction}` : jsonInstruction;
    }

    const tools: Anthropic.Tool[] | undefined = req.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Tool['input_schema'],
    }));

    const response = await client.messages.create({
      model: req.model,
      max_tokens: req.maxTokens ?? 1024,
      temperature: req.temperature,
      system: systemText || undefined,
      messages: this.toAnthropicMessages(req.messages),
      tools,
    });

    let content = '';
    const toolCalls: AIToolCall[] = [];
    for (const block of response.content) {
      if (block.type === 'text') {
        content += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: (block.input ?? {}) as Record<string, unknown>,
        });
      }
    }

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      model: response.model,
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async embed(): Promise<AIEmbeddingResult> {
    throw new Error('Anthropic provider does not support embeddings; use OpenAI for embeddings');
  }

  private toAnthropicMessages(messages: AIMessage[]): Anthropic.MessageParam[] {
    const result: Anthropic.MessageParam[] = [];
    for (const m of messages) {
      if (m.role === 'system') continue; // pulled into top-level `system` above
      if (m.role === 'tool') {
        result.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: m.toolCallId ?? '',
              content: m.content,
            },
          ],
        });
        continue;
      }
      result.push({ role: m.role, content: m.content });
    }
    return result;
  }
}
