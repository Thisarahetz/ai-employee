import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsAppAdapterService } from '../whatsapp/whatsapp-adapter.service';

export interface ChannelSendParams {
  channelId: string;
  tenantId: string;
  content: string;
}

/**
 * Cross-agent contract: ResponseService (owned by the conversation/AI-agent slice)
 * injects this service to fan out an outbound AI/human message to whichever channel the
 * conversation is on. Outbound delivery is best-effort — the message is already
 * persisted by ResponseService before this runs, so a provider hiccup here must never
 * throw back into the caller; everything is wrapped in try/catch and logged.
 */
@Injectable()
export class ChannelRegistryService {
  private readonly logger = new Logger(ChannelRegistryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsAppAdapter: WhatsAppAdapterService,
  ) {}

  async send(params: ChannelSendParams): Promise<void> {
    const { channelId, tenantId, content } = params;

    try {
      const channel = await this.prisma.channel.findFirst({ where: { id: channelId, tenantId } });
      if (!channel) {
        this.logger.warn(`send() called for unknown channel ${channelId} (tenant ${tenantId})`);
        return;
      }

      switch (channel.type) {
        case 'WHATSAPP': {
          // TODO: pass destination explicitly once ResponseService threads it through —
          // this only has {channelId, tenantId, content} to work with, so as a
          // best-effort scaffold we resolve the customer's phone off the most recently
          // updated conversation on this channel.
          const conversation = await this.prisma.conversation.findFirst({
            where: { channelId, tenantId },
            orderBy: { updatedAt: 'desc' },
            include: { customer: true },
          });
          const phone = conversation?.customer?.phone;
          if (!phone) {
            this.logger.warn(
              `No customer phone number found for WhatsApp channel ${channelId}; dropping outbound message`,
            );
            return;
          }
          await this.whatsAppAdapter.sendMessage(phone, content);
          return;
        }
        case 'WEBSITE_CHAT':
          // TODO: push via websocket/SSE — scaffold has no realtime transport yet.
          this.logger.log(`[WEBSITE_CHAT no-op] channel=${channelId} content="${content}"`);
          return;
        case 'EMAIL':
          // TODO: push via SMTP — scaffold has no outbound email transport yet.
          this.logger.log(`[EMAIL no-op] channel=${channelId} content="${content}"`);
          return;
        default:
          // FACEBOOK_MESSENGER / INSTAGRAM / TELEGRAM / SMS / VOICE — no adapter built yet.
          this.logger.log(`[${channel.type} no-op] channel=${channelId} content="${content}"`);
          return;
      }
    } catch (error) {
      this.logger.error(
        `ChannelRegistryService.send failed for channel ${channelId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
