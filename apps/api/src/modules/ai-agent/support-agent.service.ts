import { Injectable } from '@nestjs/common';
import { AgentType, MessageSender } from '@prisma/client';
import { AiProviderService } from '../ai-provider/ai-provider.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MessageService } from '../message/message.service';

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
  ) {}

  async respond(tenantId: string, conversationId: string, latestMessage: string): Promise<string> {
    const [recentMessages, aiAgent] = await Promise.all([
      this.messageService.getRecentMessages(tenantId, conversationId, 10),
      this.prisma.aiAgent.findUnique({
        where: { tenantId_type: { tenantId, type: AgentType.SUPPORT } },
      }),
    ]);

    const systemPrompt = aiAgent?.systemPrompt?.trim() || DEFAULT_SUPPORT_PROMPT;

    // getRecentMessages is assumed to return messages oldest-first, ready to
    // feed straight in as chronological history. The just-persisted inbound
    // message is very likely already the last entry — drop it if so, since
    // we re-add `latestMessage` as the final turn below (avoids sending the
    // same customer message to the model twice).
    const history = recentMessages
      .filter((m, idx) => !(idx === recentMessages.length - 1 && m.content === latestMessage))
      .map((m) => ({
        // HUMAN_AGENT/SYSTEM turns are folded into 'assistant' for simplicity —
        // this is a scaffold, not a full role-fidelity transcript replay.
        role: (m.sender === MessageSender.CUSTOMER ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.content,
      }));

    const result = await this.aiProviderService.complete(
      tenantId,
      AgentType.SUPPORT,
      [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: latestMessage }],
      { conversationId },
    );

    return result.content;
  }
}
