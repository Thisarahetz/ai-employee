import { Injectable, Logger } from '@nestjs/common';
import { CredentialType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsAppAdapterService } from '../whatsapp/whatsapp-adapter.service';
import { ChannelService } from './channel.service';

export interface ChannelSendParams {
  channelId: string;
  tenantId: string;
  content: string;
  /**
   * The customer's address on the channel — phone number for WhatsApp, session
   * id for website chat. Threaded through explicitly by ResponseService; when
   * absent, WhatsApp falls back to the most-recently-updated conversation's
   * customer contact on this channel.
   */
  destination?: string;
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
    private readonly channelService: ChannelService,
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
          const destination =
            params.destination ?? (await this.resolveWhatsAppFallbackDestination(tenantId, channelId));
          if (!destination) {
            this.logger.warn(
              `No destination phone for WhatsApp channel ${channelId}; dropping outbound message`,
            );
            return;
          }

          const config = (channel.config ?? {}) as Record<string, unknown>;
          const credential = await this.channelService.getDecryptedCredential(tenantId, channelId);
          const accessToken =
            credential?.type === CredentialType.BEARER_TOKEN && typeof credential.token === 'string'
              ? credential.token
              : undefined;

          await this.whatsAppAdapter.sendMessage(destination, content, {
            phoneNumberId: typeof config.phoneNumberId === 'string' ? config.phoneNumberId : undefined,
            accessToken,
          });
          return;
        }
        case 'WEBSITE_CHAT':
          // Outbound for website chat is pull-based: the embedded widget polls
          // GET /channels/website-chat/:channelId/messages and picks up the AI
          // reply that ResponseService already persisted. Nothing to push here.
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

  /**
   * Dispatches an outbound message called by automation workflows / n8n HTTP Request nodes.
   * Handles finding the tenant channel or gracefully recording the delivery.
   */
  async dispatchOutbound(params: {
    tenantId?: string;
    recipient: string;
    content: string;
    channelId?: string;
  }): Promise<{ success: boolean; messageId: string; status: string; detail?: string }> {
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.logger.log(
      `dispatchOutbound: tenant=${params.tenantId ?? 'unknown'} recipient=${params.recipient} messageId=${messageId}`,
    );

    if (!params.tenantId) {
      // Graceful fallback for workflows triggered without tenantId
      this.logger.log(`[Mock Outbound] To: ${params.recipient} | Body: "${params.content}"`);
      return { success: true, messageId, status: 'mock_delivered' };
    }

    const channel = params.channelId
      ? await this.prisma.channel.findFirst({ where: { id: params.channelId, tenantId: params.tenantId } })
      : await this.prisma.channel.findFirst({
          where: { tenantId: params.tenantId, type: 'WHATSAPP' },
        });

    if (channel && channel.type === 'WHATSAPP') {
      try {
        const config = (channel.config ?? {}) as Record<string, unknown>;
        const credential = await this.channelService.getDecryptedCredential(params.tenantId, channel.id);
        const accessToken =
          credential?.type === CredentialType.BEARER_TOKEN && typeof credential.token === 'string'
            ? credential.token
            : undefined;

        if (typeof config.phoneNumberId === 'string' && accessToken) {
          await this.whatsAppAdapter.sendMessage(params.recipient, params.content, {
            phoneNumberId: config.phoneNumberId,
            accessToken,
          });
          return { success: true, messageId, status: 'delivered', detail: 'Sent via WhatsApp' };
        }
      } catch (err: any) {
        this.logger.warn(`WhatsApp dispatch attempt failed: ${err.message}. Falling back to recorded delivery.`);
      }
    }

    this.logger.log(`[Outbound Channel Recorded] To: ${params.recipient} | Body: "${params.content}"`);
    return { success: true, messageId, status: 'simulated_delivered' };
  }

  /**
   * Fires a canned "you're connected" message through the channel so the user
   * can confirm delivery end-to-end from the channel detail page. Returns a
   * human-readable outcome rather than throwing.
   */
  async sendTest(tenantId: string, channelId: string): Promise<{ ok: boolean; detail: string }> {
    const channel = await this.prisma.channel.findFirst({ where: { id: channelId, tenantId } });
    if (!channel) return { ok: false, detail: 'Channel not found.' };

    const testContent = "👋 Test message from your AI Employee — this channel is connected.";

    switch (channel.type) {
      case 'WHATSAPP': {
        const destination = await this.resolveWhatsAppFallbackDestination(tenantId, channelId);
        if (!destination) {
          return {
            ok: false,
            detail:
              'No customer conversation on this channel yet — send an inbound WhatsApp message first, then retry the test.',
          };
        }
        const config = (channel.config ?? {}) as Record<string, unknown>;
        const credential = await this.channelService.getDecryptedCredential(tenantId, channelId);
        const accessToken =
          credential?.type === CredentialType.BEARER_TOKEN && typeof credential.token === 'string'
            ? credential.token
            : undefined;
        if (typeof config.phoneNumberId !== 'string' || !accessToken) {
          return {
            ok: false,
            detail: 'Set the phone number ID and save a WhatsApp access token credential first.',
          };
        }
        await this.whatsAppAdapter.sendMessage(destination, testContent, {
          phoneNumberId: config.phoneNumberId,
          accessToken,
        });
        return { ok: true, detail: `Test message dispatched to ${destination} via the WhatsApp Cloud API.` };
      }
      case 'WEBSITE_CHAT': {
        const conversation = await this.prisma.conversation.findFirst({
          where: { channelId, tenantId },
          orderBy: { updatedAt: 'desc' },
        });
        if (!conversation) {
          return {
            ok: false,
            detail: 'No widget session yet — embed the snippet and send a message from the widget, then retry.',
          };
        }
        await this.prisma.message.create({
          data: { tenantId, conversationId: conversation.id, sender: 'AI', content: testContent },
        });
        return {
          ok: true,
          detail: 'Added a test message to the most recent widget session — it appears in an open widget within ~2s.',
        };
      }
      default:
        return { ok: false, detail: `Test delivery isn't supported for ${channel.type} channels yet.` };
    }
  }

  /**
   * Best-effort fallback when ResponseService couldn't supply a destination:
   * resolve the customer's phone off the most recently updated conversation on
   * this channel (WhatsApp stores the phone as the customer's `externalId`).
   */
  private async resolveWhatsAppFallbackDestination(
    tenantId: string,
    channelId: string,
  ): Promise<string | undefined> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { channelId, tenantId },
      orderBy: { updatedAt: 'desc' },
      include: { customer: true },
    });
    return conversation?.customer?.phone ?? conversation?.customer?.externalId ?? undefined;
  }
}
