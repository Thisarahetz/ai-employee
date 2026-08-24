import { Injectable, Logger } from '@nestjs/common';
import { AgentType, AiProviderName as PrismaAiProviderName } from '@prisma/client';
import {
  getProvider,
  estimateCostUsd,
  type AIMessage,
  type AIToolDefinition,
  type AICompletionResult,
  type AIEmbeddingResult,
  type AIProviderName,
} from '@ai-employee/ai-core';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Default provider/model used when a tenant has no AiConfiguration yet for a
 * given AgentType. In a real deployment this should be seeded automatically
 * on tenant signup (one AiAgent + AiConfiguration row per AgentType) — this
 * fallback exists purely for scaffold safety so the pipeline still runs
 * end-to-end against a freshly created tenant.
 */
const DEFAULT_CONFIG_BY_AGENT: Record<AgentType, { provider: PrismaAiProviderName; model: string }> = {
  [AgentType.ROUTER]: { provider: PrismaAiProviderName.OPENAI, model: 'gpt-4o-mini' },
  [AgentType.SUPPORT]: { provider: PrismaAiProviderName.OPENAI, model: 'gpt-4o' },
  [AgentType.KNOWLEDGE]: { provider: PrismaAiProviderName.OPENAI, model: 'gpt-4o' },
  [AgentType.ACTION]: { provider: PrismaAiProviderName.OPENAI, model: 'gpt-4o' },
  [AgentType.HUMAN]: { provider: PrismaAiProviderName.OPENAI, model: 'gpt-4o-mini' },
};

const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_MAX_TOKENS = 1024;

function toAiCoreProviderName(p: PrismaAiProviderName): AIProviderName {
  return p === PrismaAiProviderName.ANTHROPIC ? 'anthropic' : 'openai';
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
}

/**
 * Bridges @ai-employee/ai-core's provider abstraction into the tenant-aware,
 * usage-tracked NestJS world: resolves which provider/model a tenant+agent
 * is configured to use, calls it, times the call, and records an
 * AiUsageLog row for cost/latency observability.
 */
@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);

  constructor(private readonly prisma: PrismaService) {}

  async complete(
    tenantId: string,
    agentType: AgentType,
    messages: AIMessage[],
    opts?: AiCompleteOptions,
  ): Promise<AICompletionResult> {
    const { provider: providerName, model, temperature, maxTokens } = await this.resolveConfig(
      tenantId,
      agentType,
    );

    const provider = getProvider(toAiCoreProviderName(providerName));
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
        `AI completion failed (tenant=${tenantId}, agent=${agentType}, provider=${providerName}, model=${model}): ${(err as Error).message}`,
      );
      throw err;
    }

    const executionTimeMs = Date.now() - start;
    const estimatedCostUsd = estimateCostUsd(model, result.inputTokens, result.outputTokens);

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
      },
    });

    return result;
  }

  async embed(tenantId: string, text: string): Promise<AIEmbeddingResult> {
    // Embeddings are always OpenAI — Anthropic has no embeddings endpoint.
    // Logged under AgentType.KNOWLEDGE since embeddings are only ever
    // produced in service of RAG ingestion/search and the schema has no
    // dedicated "embedding" AgentType.
    const provider = getProvider('openai');
    const start = Date.now();
    const result = await provider.embed(text);
    const executionTimeMs = Date.now() - start;
    const estimatedCostUsd = estimateCostUsd(result.model, result.tokenCount, 0);

    await this.prisma.aiUsageLog.create({
      data: {
        tenantId,
        agentType: AgentType.KNOWLEDGE,
        provider: PrismaAiProviderName.OPENAI,
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

    const fallback = DEFAULT_CONFIG_BY_AGENT[agentType];
    this.logger.warn(
      `No AiConfiguration for tenant=${tenantId} agent=${agentType}; using scaffold default ${fallback.provider}/${fallback.model}. This should be seeded on tenant signup.`,
    );
    return { ...fallback, temperature: DEFAULT_TEMPERATURE, maxTokens: DEFAULT_MAX_TOKENS };
  }
}
