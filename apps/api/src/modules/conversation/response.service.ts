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
  async sendResponse(params: SendResponseParams): Promise<void> {
    const { tenantId, conversationId, content, agentType } = params;

    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const sender = agentType === AgentType.HUMAN ? MessageSender.HUMAN_AGENT : MessageSender.AI;

    await this.messageService.create({
      tenantId,
      conversationId,
      sender,
      agentType,
      content,
    });

    await this.channelRegistry.send({
      channelId: conversation.channelId,
      tenantId,
      content,
    });
  }
}
