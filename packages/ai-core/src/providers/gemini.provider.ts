import { GoogleGenAI } from '@google/genai';
import type {
  AIProvider,
  AICompletionRequest,
  AICompletionResult,
  AIEmbeddingResult,
  AIMessage,
  AIToolCall,
} from '../types';

const DEFAULT_EMBEDDING_MODEL = 'text-embedding-004';
const DEFAULT_CHAT_MODEL = 'gemini-2.5-flash';

/**
 * GeminiProvider — wraps the `@google/genai` SDK behind the AIProvider interface.
 */
export class GeminiProvider implements AIProvider {
  readonly name = 'gemini' as const;

  private client: GoogleGenAI | null = null;

  private getClient(): GoogleGenAI {
    if (!this.client) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error(
          'GEMINI_API_KEY is not set — cannot call the Gemini provider. Set it in your environment (see .env.example).',
        );
      }
      this.client = new GoogleGenAI({ apiKey });
    }
    return this.client;
  }

  async complete(req: AICompletionRequest): Promise<AICompletionResult> {
    const client = this.getClient();
    const modelId = req.model || DEFAULT_CHAT_MODEL;

    // Convert AIMessages to Google GenAI Content format
    const contents = this.toGeminiContents(req.messages);
    
    // Construct system instruction if there are system messages
    const systemMessages = req.messages.filter((m) => m.role === 'system');
    let systemInstruction: string | undefined;
    if (systemMessages.length > 0) {
      systemInstruction = systemMessages.map((m) => m.content).join('\n\n');
    }

    const tools = req.tools?.map((t) => ({
      functionDeclarations: [
        {
          name: t.name,
          description: t.description,
          parameters: t.parameters as any, // GenAI typing requires Schema
        },
      ],
    }));

    const response = await client.models.generateContent({
      model: modelId,
      contents,
      config: {
        systemInstruction,
        temperature: req.temperature,
        maxOutputTokens: req.maxTokens,
        tools: tools,
        responseMimeType: req.responseFormat === 'json' ? 'application/json' : 'text/plain',
      },
    });

    const toolCalls: AIToolCall[] = [];
    
    // Check if the response contains function calls
    if (response.functionCalls && response.functionCalls.length > 0) {
      for (const fc of response.functionCalls) {
        toolCalls.push({
          id: `call_${Math.random().toString(36).substr(2, 9)}`, // Gemini doesn't return tool call IDs in the same way, we mock one
          name: fc.name ?? 'unknown',
          arguments: fc.args as Record<string, unknown>,
        });
      }
    }

    return {
      content: response.text ?? '',
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      model: modelId,
    };
  }

  async embed(text: string, model = DEFAULT_EMBEDDING_MODEL): Promise<AIEmbeddingResult> {
    const client = this.getClient();
    const response = await client.models.embedContent({
      model,
      contents: text,
    });

    return {
      embedding: response.embeddings?.[0]?.values ?? [],
      tokenCount: 0, // SDK doesn't consistently return token counts for embeddings
      model,
    };
  }

  private toGeminiContents(messages: AIMessage[]): any[] {
    const contents: any[] = [];
    
    // Skip system messages as they are handled via systemInstruction
    const chatMessages = messages.filter((m) => m.role !== 'system');
    
    for (const m of chatMessages) {
      if (m.role === 'user') {
        contents.push({ role: 'user', parts: [{ text: m.content }] });
      } else if (m.role === 'assistant') {
        contents.push({ role: 'model', parts: [{ text: m.content }] });
      } else if (m.role === 'tool') {
        // Handling tool results in Gemini
        // We parse the tool result back into Gemini's format
        contents.push({
          role: 'user', // In Gemini, function responses are sent as 'user' role with functionResponse part
          parts: [
            {
              functionResponse: {
                name: m.toolCallId || 'unknown_tool',
                response: this.parseArguments(m.content),
              }
            }
          ]
        });
      }
    }
    
    return contents;
  }
  
  private parseArguments(raw: string): Record<string, unknown> {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { result: raw };
    }
  }
}
