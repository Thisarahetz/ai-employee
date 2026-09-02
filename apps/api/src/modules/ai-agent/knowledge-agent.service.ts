import { Injectable, Logger } from '@nestjs/common';
import { AgentType } from '@prisma/client';
import { AiProviderService } from '../ai-provider/ai-provider.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MessageService } from '../message/message.service';
import { RagService } from '../rag/rag.service';
import { TimeContextService } from './time-context.service';

const DEFAULT_KNOWLEDGE_PROMPT =
  "You are a knowledge assistant. Answer the customer's question about the business using the context provided below.";

/**
 * Appended to whatever persona prompt the tenant configured, so the RAG
 * guardrail can't be lost by editing the persona. Keeps the model from
 * answering out of the retrieved context or the chat history.
 */
const KNOWLEDGE_GUARDRAIL =
  "Answer ONLY from the numbered context snippets in the final message. Use the earlier conversation only to understand what the customer is referring to (e.g. a follow-up like \"and the men's one?\"), never as a source of facts. If the answer isn't in the context, say you don't have that information and offer to connect them with a human.";

/**
 * KnowledgeAgentService — never loads a whole KnowledgeBase or full
 * document. It asks RagService for just the top-K most relevant chunks for
 * THIS question and sends only those chunks + a few recent conversation turns
 * (so follow-up questions keep their referent) + the latest message. The
 * model never sees more knowledge-base content than it needs to answer a
 * single question.
 */
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
    // Retrieve across ALL of the tenant's knowledge bases — hand-authored docs plus
    // anything synced from an integration's GET /ai/knowledge feed — not just one KB.
    const [chunks, history, aiAgent, timeContext] = await Promise.all([
      this.ragService.searchTenant(tenantId, latestMessage, 5),
      this.messageService.getRecentHistory(tenantId, conversationId, 6, latestMessage),
      this.prisma.aiAgent.findUnique({
        where: { tenantId_type: { tenantId, type: AgentType.KNOWLEDGE } },
      }),
      this.timeContextService.getTimeContext(tenantId, conversationId),
    ]);

    if (!chunks.length) {
      this.logger.warn(`No relevant knowledge for tenant=${tenantId}; answering without context.`);
    }

    const persona = aiAgent?.systemPrompt?.trim() || DEFAULT_KNOWLEDGE_PROMPT;
    const temporalContext = [
      'TEMPORAL CONTEXT:',
      `- Current Date & Time: ${timeContext.formatted}`,
      `- Current Day of the Week: ${timeContext.dayOfWeek}`,
      `- Current Time: ${timeContext.timeString}`,
      `- Timezone: ${timeContext.timezone} (${timeContext.offset})`,
      timeContext.locationsSummary ? `- Available Locations:\n${timeContext.locationsSummary}` : '',
      'Use this current timestamp, day of week, and timezone to accurately answer questions about whether the business is open right now, today’s opening hours, and upcoming schedules based on the context snippets.',
    ]
      .filter(Boolean)
      .join('\n');

    const systemPrompt = `${persona}\n\n${KNOWLEDGE_GUARDRAIL}\n\n${temporalContext}`;

    const context = chunks.length
      ? chunks.map((c, i) => `[${i + 1}] ${c.content}`).join('\n\n')
      : '(no relevant context found)';

    const result = await this.aiProviderService.complete(
      tenantId,
      AgentType.KNOWLEDGE,
      [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: `Context:\n${context}\n\nQuestion: ${latestMessage}` },
      ],
      { conversationId },
    );

    return result.content;
  }
}
