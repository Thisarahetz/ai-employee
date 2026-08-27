import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConversationService } from '../conversation/conversation.service';
import { PostWebsiteChatMessageDto } from './dto/post-website-chat-message.dto';

const DEFAULT_ACCENT = '#2a78d6';
const DEFAULT_GREETING = 'Hi! How can we help?';

/**
 * Backs the public (unauthenticated) website-chat widget endpoints. Tenant is
 * resolved from the channel row, never a JWT — the URL's `:channelId` plus a
 * widget-generated `sessionId` is the whole identity (mirrors how
 * WhatsAppController resolves tenant from `phone_number_id`).
 */
@Injectable()
export class WebsiteChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversationService: ConversationService,
  ) {}

  private async resolveChannel(channelId: string) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel || channel.type !== 'WEBSITE_CHAT') {
      throw new NotFoundException('Website chat channel not found');
    }
    return channel;
  }

  async getConfig(channelId: string) {
    const channel = await this.resolveChannel(channelId);
    const config = (channel.config ?? {}) as Record<string, unknown>;
    return {
      channelId: channel.id,
      // `active` lets an embedding site show a "chat is live / paused" status
      // without an authenticated call. The widget itself also uses it to stay
      // hidden while the channel is inactive.
      active: channel.status === 'ACTIVE',
      title: typeof config.title === 'string' && config.title ? config.title : channel.name || 'Chat with us',
      accentColor:
        typeof config.accentColor === 'string' && config.accentColor ? config.accentColor : DEFAULT_ACCENT,
      greeting:
        typeof config.greeting === 'string' && config.greeting ? config.greeting : DEFAULT_GREETING,
    };
  }

  async ingest(channelId: string, dto: PostWebsiteChatMessageDto) {
    const channel = await this.resolveChannel(channelId);
    if (channel.status !== 'ACTIVE') {
      throw new ForbiddenException('This chat channel is not active.');
    }
    const result = await this.conversationService.ingestInboundMessage({
      tenantId: channel.tenantId,
      businessId: channel.businessId ?? undefined,
      channelId: channel.id,
      customerExternalId: dto.sessionId,
      customerName: dto.customerName,
      content: dto.message,
    });
    return { conversationId: result.conversationId, messageId: result.messageId };
  }

  /**
   * The widget's polling endpoint — and the website-chat *outbound* path.
   * `ResponseService` persists the AI reply before dispatching, so a poll here
   * picks it up. `after` is an ISO timestamp cursor (last message the widget saw).
   */
  async getMessages(channelId: string, sessionId: string, after?: string) {
    const channel = await this.resolveChannel(channelId);
    if (!sessionId) return { conversationId: null, messages: [] };

    const customer = await this.prisma.customer.findFirst({
      where: { tenantId: channel.tenantId, externalId: sessionId },
    });
    if (!customer) return { conversationId: null, messages: [] };

    const conversation = await this.prisma.conversation.findFirst({
      where: { tenantId: channel.tenantId, customerId: customer.id, channelId: channel.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!conversation) return { conversationId: null, messages: [] };

    const afterDate = after ? new Date(after) : undefined;
    const messages = await this.prisma.message.findMany({
      where: {
        tenantId: channel.tenantId,
        conversationId: conversation.id,
        ...(afterDate && !Number.isNaN(afterDate.getTime()) ? { createdAt: { gt: afterDate } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    return {
      conversationId: conversation.id,
      messages: messages.map((m) => ({
        id: m.id,
        sender: m.sender,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }
}
