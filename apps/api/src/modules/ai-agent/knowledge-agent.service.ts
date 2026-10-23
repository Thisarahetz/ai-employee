import { Injectable, Logger } from '@nestjs/common';
import { AgentType } from '@prisma/client';
import { AiProviderService } from '../ai-provider/ai-provider.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MessageService } from '../message/message.service';
import { RagService } from '../rag/rag.service';
import { TimeContextService } from './time-context.service';
import { AgentTurn, DEFAULT_TURN } from './agent-turn';
import { replyLanguageInstruction } from '../../common/language/language';

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

  async respond(
    tenantId: string,
    conversationId: string,
    latestMessage: string,
    turn: AgentTurn = DEFAULT_TURN,
  ): Promise<string> {
    // The business's documents are usually English. For a Sinhala/Singlish
    // question, also search with an English version so the right facts are found.
    const searchQueries = [latestMessage];
    if (turn.language !== 'en') {
      const english = turn.searchQuery ?? (await this.translateForSearch(tenantId, conversationId, latestMessage));
      if (english && english.toLowerCase() !== latestMessage.toLowerCase()) searchQueries.push(english);
    }

    // RTK Token Reduction: Query top 3 most relevant chunks instead of 5, saving 40-50% context tokens.
    const [chunks, history, aiAgent, timeContext] = await Promise.all([
      this.ragService.searchTenantMulti(tenantId, searchQueries, 3),
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
    const staticSystemPrompt = `${persona}\n\n${KNOWLEDGE_GUARDRAIL}\n\n${replyLanguageInstruction(turn.language)}`;

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

  /**
   * Short English rendering of a Sinhala/Singlish question, used only for the
   * knowledge-base search. Best effort: a failure just means we search with
   * the original text alone.
   */
  private async translateForSearch(tenantId: string, conversationId: string, text: string): Promise<string | null> {
    try {
      const res = await this.aiProviderService.complete(
        tenantId,
        AgentType.ROUTER,
        [
          {
            role: 'system',
            content:
              'Translate the customer message (Sinhala or Singlish) into a short English search query. Output only the English text, nothing else.',
            cacheControl: true,
          },
          { role: 'user', content: text.slice(0, 1000) },
        ],
        { conversationId },
      );
      const out = res.content.trim().replace(/^["']|["']$/g, '');
      return out ? out.slice(0, 300) : null;
    } catch (err) {
      this.logger.warn(`Search translation failed for tenant=${tenantId}: ${(err as Error).message}`);
      return null;
    }
  }
}
