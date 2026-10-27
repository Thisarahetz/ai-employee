import { Injectable, NotFoundException } from '@nestjs/common';
import { AgentType, MessageSender } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
// NOTE: ChannelModule/ChannelRegistryService are owned by the integration-layer
// agent working concurrently on this monorepo; this module imports them by
// the contract path given in the build spec (they will exist at build time).
import { ChannelRegistryService } from '../channel/channel-registry.service';
import { MessageService } from '../message/message.service';

export interface SendResponseParams {
  tenantId: string;
  conversationId: string;
  content: string;
  agentType: AgentType;
  /** Stored on the message, e.g. { replySource: 'saved_answer', savedAnswerId }. */
  metadata?: Record<string, unknown>;
}

@Injectable()
export class ResponseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messageService: MessageService,
    private readonly channelRegistry: ChannelRegistryService,
  ) {}

  /**
   * Persists the outbound AI/human message, then dispatches it back to the
   * customer via the conversation's channel (WhatsApp/website chat/email/...).
   */
  async sendResponse(params: SendResponseParams) {
    const { tenantId, conversationId, content, agentType, metadata } = params;

    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
      include: { customer: true },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const sender = agentType === AgentType.HUMAN ? MessageSender.HUMAN_AGENT : MessageSender.AI;

    const message = await this.messageService.create({
      tenantId,
      conversationId,
      sender,
      agentType,
      content,
      metadata,
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: message.createdAt },
    });

    await this.channelRegistry.send({
      channelId: conversation.channelId,
      tenantId,
      content,
      // WhatsApp stores the customer's phone as `externalId`; website chat as
      // the session id. Either way it's the address to deliver back to.
      destination: conversation.customer?.phone ?? conversation.customer?.externalId ?? undefined,
      replySource: typeof metadata?.replySource === 'string' ? metadata.replySource : undefined,
      language: conversation.language,
    });

    return message;
  }
}
