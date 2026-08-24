import { Injectable, Logger } from '@nestjs/common';
import { AgentType } from '@prisma/client';
import { AiProviderService } from '../ai-provider/ai-provider.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RagService } from '../rag/rag.service';

const KNOWLEDGE_SYSTEM_PROMPT =
  "You are a knowledge assistant. Answer the customer's question using ONLY the provided context snippets below. If the answer isn't in the context, say you don't have that information and offer to connect them with a human.";

/**
 * KnowledgeAgentService — never loads a whole KnowledgeBase or full
 * document. It asks RagService for just the top-K most relevant chunks for
 * THIS question and sends only those chunks + the latest message to the
 * model. This is the core RAG token-optimization: the model never sees more
 * knowledge-base content than it needs to answer a single question.
 */
@Injectable()
export class KnowledgeAgentService {
  private readonly logger = new Logger(KnowledgeAgentService.name);

  constructor(
    private readonly aiProviderService: AiProviderService,
    private readonly ragService: RagService,
    private readonly prisma: PrismaService,
  ) {}

  async respond(tenantId: string, conversationId: string, latestMessage: string): Promise<string> {
    // Scaffold: picks the tenant's first/default KnowledgeBase. A future
    // version could route to a specific KB per Business/Channel.
    const knowledgeBase = await this.prisma.knowledgeBase.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });

    if (!knowledgeBase) {
      this.logger.warn(`No KnowledgeBase configured for tenant=${tenantId}; answering without context.`);
      const result = await this.aiProviderService.complete(
        tenantId,
        AgentType.KNOWLEDGE,
        [
          { role: 'system', content: KNOWLEDGE_SYSTEM_PROMPT },
          { role: 'user', content: latestMessage },
        ],
        { conversationId },
      );
      return result.content;
    }

    const chunks = await this.ragService.search(tenantId, knowledgeBase.id, latestMessage, 5);
    const context = chunks.length
      ? chunks.map((c, i) => `[${i + 1}] ${c.content}`).join('\n\n')
      : '(no relevant context found)';

    const result = await this.aiProviderService.complete(
      tenantId,
      AgentType.KNOWLEDGE,
      [
        { role: 'system', content: KNOWLEDGE_SYSTEM_PROMPT },
        { role: 'user', content: `Context:\n${context}\n\nQuestion: ${latestMessage}` },
      ],
      { conversationId },
    );

    return result.content;
  }
}
