import { Injectable, Logger } from '@nestjs/common';
import { AgentType } from '@prisma/client';
import { AiProviderService } from '../ai-provider/ai-provider.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MessageService } from '../message/message.service';
import { RagService } from '../rag/rag.service';
import { TimeContextService } from './time-context.service';

const DEFAULT_KNOWLEDGE_PROMPT =
  "You are a factual knowledge assistant for the business.";

/**
 * Caveman-style high-density RAG guardrail:
 * Enforces strict factual fidelity while stripping verbose filler, hedging, and pleasantries.
 */
const KNOWLEDGE_GUARDRAIL =
  "Answer ONLY from the numbered context snippets. Be direct, concise, and professional.\n" +
  "Omit pleasantries, hedging, and conversational filler. State the exact facts (pricing, hours, address, services) in 1 to 3 sentences.\n" +
  "If the answer is not in the context, concisely state that you do not have that information and offer to connect them with a human.";

@Injectable()
export class KnowledgeAgentService {
  private readonly logger = new Logger(KnowledgeAgentService.name);

  constructor(
    private readonly aiProviderService: AiProviderService,
    private readonly prisma: PrismaService,
    private readonly messageService: MessageService,
    private readonly ragService: RagService,
    private readonly timeContextService: TimeContextService,
  ) {}

  async respond(tenantId: string, conversationId: string, latestMessage: string): Promise<string> {
    // RTK Token Reduction: Query top 3 most relevant chunks instead of 5, saving 40-50% context tokens.
    const [chunks, history, aiAgent, timeContext] = await Promise.all([
      this.ragService.searchTenant(tenantId, latestMessage, 3),
      this.messageService.getRecentHistory(tenantId, conversationId, 4, latestMessage),
      this.prisma.aiAgent.findUnique({
        where: { tenantId_type: { tenantId, type: AgentType.KNOWLEDGE } },
      }),
      this.timeContextService.getTimeContext(tenantId, conversationId),
    ]);

    if (!chunks.length) {
      this.logger.warn(`No relevant knowledge for tenant=${tenantId}; answering without context.`);
    }

    const persona = aiAgent?.systemPrompt?.trim() || DEFAULT_KNOWLEDGE_PROMPT;
    // Static prompt prefix: persona + guardrails (100% cacheable across requests)
    const staticSystemPrompt = `${persona}\n\n${KNOWLEDGE_GUARDRAIL}`;

    const temporalContext = [
      'TEMPORAL CONTEXT:',
      `- Current Date & Time: ${timeContext.formatted}`,
      `- Current Day of Week: ${timeContext.dayOfWeek}`,
      `- Timezone: ${timeContext.timezone} (${timeContext.offset})`,
      timeContext.locationsSummary ? `- Locations:\n${timeContext.locationsSummary}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const context = chunks.length
      ? chunks.map((c, i) => `[${i + 1}] ${c.content}`).join('\n\n')
      : '(no relevant context found)';

    const userTurnContent = [
      `Context:\n${context}`,
      temporalContext,
      `Question: ${latestMessage}`,
    ].join('\n\n');

    const result = await this.aiProviderService.complete(
      tenantId,
      AgentType.KNOWLEDGE,
      [
        { role: 'system', content: staticSystemPrompt, cacheControl: true },
        ...history,
        { role: 'user', content: userTurnContent },
      ],
      { conversationId },
    );

    return result.content;
  }
}
