import { Injectable, Logger } from '@nestjs/common';
import { AgentType, AiProviderName as PrismaAiProviderName } from '@prisma/client';
import {
  estimateCostUsd,
  type AIMessage,
  type AIToolDefinition,
  type AICompletionResult,
  type AIEmbeddingResult,
  type AIProviderName,
} from '@ai-employee/ai-core';
import { PrismaService } from '../../prisma/prisma.service';
import { ProviderKeysService } from './provider-keys.service';

/**
 * Platform default provider/model, used when a tenant has no AiConfiguration
 * for an AgentType. Set per deployment with AI_DEFAULT_PROVIDER
 * (OPENAI | ANTHROPIC | GEMINI) and AI_DEFAULT_MODEL; tenants override per
 * agent via the `AiConfiguration` model.
 */
export function platformDefaultModel(env: NodeJS.ProcessEnv = process.env): { provider: PrismaAiProviderName; model: string } {
  const raw = (env.AI_DEFAULT_PROVIDER ?? '').toUpperCase();
  const provider = (Object.values(PrismaAiProviderName) as string[]).includes(raw)
    ? (raw as PrismaAiProviderName)
    : PrismaAiProviderName.GEMINI;
  const fallbackModel: Record<PrismaAiProviderName, string> = {
    [PrismaAiProviderName.GEMINI]: 'gemini-2.5-flash',
    [PrismaAiProviderName.OPENAI]: 'gpt-4o-mini',
    [PrismaAiProviderName.ANTHROPIC]: 'claude-haiku-4-5',
  };
  return { provider, model: env.AI_DEFAULT_MODEL?.trim() || fallbackModel[provider] };
}

const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_MAX_TOKENS = 1024;

function toAiCoreProviderName(p: PrismaAiProviderName): AIProviderName {
  switch (p) {
    case PrismaAiProviderName.ANTHROPIC:
      return 'anthropic';
    case PrismaAiProviderName.GEMINI:
      return 'gemini';
    case PrismaAiProviderName.OPENAI:
    default:
      return 'openai';
  }
}

export interface AiCompleteOptions {
  tools?: AIToolDefinition[];
  conversationId?: string;
  messageId?: string;
  /**
   * Not in the original ownership spec's opts shape, but ai-core's
   * AICompletionRequest already supports it and RouterAgentService needs to
   * request strict JSON output — threading it through here was the natural
   * way to satisfy that without inventing a parallel code path.
   */
  responseFormat?: 'text' | 'json';
  /** AI workforce task this call belongs to (cost attribution). */
  taskId?: string;
}

export type TrackedCompletion = AICompletionResult & { estimatedCostUsd: number; model: string };

/**
 * Bridges @ai-employee/ai-core's provider abstraction into the tenant-aware,
 * usage-tracked NestJS world: resolves which provider/model a tenant+agent
 * is configured to use, calls it, times the call, and records an
 * AiUsageLog row for cost/latency observability.
 */
@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly keys: ProviderKeysService,
  ) {}

  async complete(
    tenantId: string,
    agentType: AgentType,
    messages: AIMessage[],
    opts?: AiCompleteOptions,
  ): Promise<TrackedCompletion> {
    const { provider: providerName, model, temperature, maxTokens } = await this.resolveConfig(
      tenantId,
      agentType,
    );

    const { client: provider, keyId } = await this.keys.resolve(tenantId, providerName);
    const start = Date.now();

    let result: AICompletionResult;
    try {
      result = await provider.complete({
        model,
        messages,
        temperature,
        maxTokens,
        tools: opts?.tools,
        responseFormat: opts?.responseFormat,
      });
    } catch (err) {
      this.logger.error(
        `AI completion failed (tenant=${tenantId}, agent=${agentType}, provider=${providerName}, model=${model}): ${(err as Error).message.split('\n')[0]!.slice(0, 300)}`,
      );
      if (keyId) await this.keys.recordError(keyId, err);
      throw err;
    }

    const executionTimeMs = Date.now() - start;
    const estimatedCostUsd = estimateCostUsd(
      model,
      result.inputTokens,
      result.outputTokens,
      result.cachedInputTokens,
    );

    await this.prisma.aiUsageLog.create({
      data: {
        tenantId,
        conversationId: opts?.conversationId,
        messageId: opts?.messageId,
        agentType,
        provider: providerName,
        model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        estimatedCostUsd,
        executionTimeMs,
        taskId: opts?.taskId,
      },
    });

    return { ...result, estimatedCostUsd, model };
  }

  async embed(tenantId: string, text: string): Promise<AIEmbeddingResult> {
    // Embeddings follow the scaffold default provider (Gemini) — it's the one
    // with a key wired in `.env`. Anthropic has no embeddings endpoint;
    // OpenAI would need its own key. The Gemini provider requests 1536-dim
    // vectors to match `DocumentChunk.embedding` (`vector(1536)`).
    // Logged under AgentType.KNOWLEDGE since embeddings are only ever
    // produced in service of RAG ingestion/search and the schema has no
    // dedicated "embedding" AgentType.
    const { client: provider } = await this.keys.resolve(tenantId, PrismaAiProviderName.GEMINI);
    const start = Date.now();
    const result = await provider.embed(text);
    const executionTimeMs = Date.now() - start;
    const estimatedCostUsd = estimateCostUsd(result.model, result.tokenCount, 0);

    await this.prisma.aiUsageLog.create({
      data: {
        tenantId,
        agentType: AgentType.KNOWLEDGE,
        provider: PrismaAiProviderName.GEMINI,
        model: result.model,
        inputTokens: result.tokenCount,
        outputTokens: 0,
        estimatedCostUsd,
        executionTimeMs,
      },
    });

    return result;
  }

  private async resolveConfig(
    tenantId: string,
    agentType: AgentType,
  ): Promise<{ provider: PrismaAiProviderName; model: string; temperature: number; maxTokens: number }> {
    const aiAgent = await this.prisma.aiAgent.findUnique({
      where: { tenantId_type: { tenantId, type: agentType } },
      include: { configuration: true },
    });

    if (aiAgent?.configuration) {
      const { provider, model, temperature, maxTokens } = aiAgent.configuration;
      return { provider, model, temperature, maxTokens };
    }

    const fallback = platformDefaultModel();
    this.logger.debug(`No AiConfiguration for tenant=${tenantId} agent=${agentType}; using platform default ${fallback.provider}/${fallback.model}.`);
    return { ...fallback, temperature: DEFAULT_TEMPERATURE, maxTokens: DEFAULT_MAX_TOKENS };
  }
}
