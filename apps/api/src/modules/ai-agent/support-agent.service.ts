import { Injectable } from '@nestjs/common';
import { AgentType } from '@prisma/client';
import { AiProviderService } from '../ai-provider/ai-provider.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MessageService } from '../message/message.service';
import { TimeContextService } from './time-context.service';

const DEFAULT_SUPPORT_PROMPT =
  'You are a friendly, concise customer support agent. Answer the customer directly using the recent conversation for context. Keep responses short and helpful.';

/**
 * SupportAgentService — loads only the last 10 messages of THIS conversation
 * plus the tenant's configured SUPPORT system prompt. Deliberately does NOT
 * load the knowledge base or any tool definitions: general support replies
 * don't need either, and pulling them in here would inflate the token cost
 * of every generic support turn (the common case) for no benefit.
 */
@Injectable()
export class SupportAgentService {
  constructor(
    private readonly aiProviderService: AiProviderService,
    private readonly messageService: MessageService,
    private readonly prisma: PrismaService,
    private readonly timeContextService: TimeContextService,
  ) {}

  async respond(tenantId: string, conversationId: string, latestMessage: string): Promise<string> {
    const [history, aiAgent, timeContext] = await Promise.all([
      this.messageService.getRecentHistory(tenantId, conversationId, 10, latestMessage),
      this.prisma.aiAgent.findUnique({
        where: { tenantId_type: { tenantId, type: AgentType.SUPPORT } },
      }),
      this.timeContextService.getTimeContext(tenantId, conversationId),
    ]);

    const persona = aiAgent?.systemPrompt?.trim() || DEFAULT_SUPPORT_PROMPT;
    const systemPrompt = `${persona}\n\nCurrent Date & Time in business timezone (${timeContext.timezone}): ${timeContext.formatted}.`;

    const result = await this.aiProviderService.complete(
      tenantId,
      AgentType.SUPPORT,
      [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: latestMessage }],
      { conversationId },
    );

    return result.content;
  }
}

