import { Injectable, NotFoundException } from '@nestjs/common';
import { ConversationStatus, MessageContentType, MessageSender } from '@prisma/client';
import { paginationSkip, toPaginatedResponse, toPaginationRequest } from '@ai-employee/shared';
import { EventService } from '../../events/event.service';
import { EVENT_TYPES, MessageReceivedPayload } from '../../events/event-types.const';
import { PrismaService } from '../../prisma/prisma.service';
import { MessageService } from '../message/message.service';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';

export interface IngestInboundMessageParams {
  tenantId: string;
  businessId?: string;
  channelId: string;
  customerExternalId: string;
  customerName?: string;
  content: string;
  contentType?: MessageContentType;
}

export interface IngestInboundMessageResult {
  conversationId: string;
  messageId: string;
  customerId: string;
}

/** Conversation statuses considered "still in flight" for a customer+channel. */
const OPEN_STATUSES: ConversationStatus[] = ['OPEN', 'AI_HANDLING', 'HUMAN_HANDLING'];

@Injectable()
export class ConversationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: EventService,
    private readonly messageService: MessageService,
  ) {}

  async list(tenantId: string, query: ListConversationsQueryDto) {
    const pagination = toPaginationRequest({ page: query.page, pageSize: query.pageSize });
    const where = {
      tenantId,
      status: query.status,
      customerId: query.customerId,
      channelId: query.channelId,
    };

    const [data, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        include: { customer: true, channel: true },
        orderBy: { lastMessageAt: 'desc' },
        skip: paginationSkip(pagination),
        take: pagination.pageSize,
      }),
      this.prisma.conversation.count({ where }),
    ]);

    return toPaginatedResponse(data, total, pagination);
  }

  async get(tenantId: string, id: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, tenantId },
      include: { customer: true, channel: true },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    return conversation;
  }

  async takeControl(tenantId: string, id: string, userId: string) {
    await this.get(tenantId, id);
    return this.prisma.conversation.update({
      where: { id },
      data: { status: 'HUMAN_HANDLING', assignedUserId: userId },
    });
  }

  async returnToAi(tenantId: string, id: string) {
    await this.get(tenantId, id);
    return this.prisma.conversation.update({
      where: { id },
      data: { status: 'AI_HANDLING', currentAgent: null },
    });
  }

  /**
   * The entry point every channel adapter calls with a normalized inbound
   * message. Finds-or-creates the Customer (by tenantId+externalId) and an
   * in-flight Conversation for that customer+channel (else creates one with
   * status OPEN and emits CONVERSATION_CREATED), persists the inbound
   * Message (sender=CUSTOMER), bumps `lastMessageAt`, and emits
   * MESSAGE_RECEIVED.
   */
  async ingestInboundMessage(
    params: IngestInboundMessageParams,
  ): Promise<IngestInboundMessageResult> {
    const { tenantId, businessId, channelId, customerExternalId, customerName, content } = params;
    const contentType = params.contentType ?? MessageContentType.TEXT;

    let customer = await this.prisma.customer.findFirst({
      where: { tenantId, externalId: customerExternalId },
    });
    if (!customer) {
      customer = await this.prisma.customer.create({
        data: { tenantId, externalId: customerExternalId, name: customerName },
      });
      await this.eventService.emit(tenantId, EVENT_TYPES.CUSTOMER_CREATED, {
        customerId: customer.id,
        externalId: customer.externalId ?? undefined,
        name: customer.name ?? undefined,
      });
    }

    let conversation = await this.prisma.conversation.findFirst({
      where: { tenantId, customerId: customer.id, channelId, status: { in: OPEN_STATUSES } },
      orderBy: { createdAt: 'desc' },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: { tenantId, businessId, customerId: customer.id, channelId, status: 'OPEN' },
      });

      await this.eventService.emit(tenantId, EVENT_TYPES.CONVERSATION_CREATED, {
        conversationId: conversation.id,
        customerId: customer.id,
        channelId,
        businessId,
      });
    }

    const message = await this.messageService.create({
      tenantId,
      conversationId: conversation.id,
      sender: MessageSender.CUSTOMER,
      content,
      contentType,
    });

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: message.createdAt },
    });

    const payload: MessageReceivedPayload = {
      tenantId,
      businessId,
      conversationId: conversation.id,
      customerId: customer.id,
      channelId,
      messageId: message.id,
      content,
      contentType,
    };
    await this.eventService.emit(tenantId, EVENT_TYPES.MESSAGE_RECEIVED, { ...payload });

    return { conversationId: conversation.id, messageId: message.id, customerId: customer.id };
  }
}
