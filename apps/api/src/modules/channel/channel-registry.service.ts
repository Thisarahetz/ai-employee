import { Injectable, Logger } from '@nestjs/common';
import { CredentialType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsAppAdapterService } from '../whatsapp/whatsapp-adapter.service';
import { ResendService } from '../notification/resend.service';
import { ChannelService } from './channel.service';

export interface ChannelSendParams {
  channelId: string;
  tenantId: string;
  content: string;
  /**
   * The customer's address on the channel — phone number for WhatsApp, session
   * id for website chat, email address for email.
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
    private readonly resendService: ResendService,
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
            provider: (config.provider as any) || (process.env.WHATSAPP_PROVIDER as any) || 'waha',
            wahaApiUrl: typeof config.wahaApiUrl === 'string' ? config.wahaApiUrl : undefined,
            wahaApiKey: typeof config.wahaApiKey === 'string' ? config.wahaApiKey : undefined,
            wahaSession: typeof config.wahaSession === 'string' ? config.wahaSession : undefined,
          });
          return;
        }
        case 'WEBSITE_CHAT':
          // Outbound for website chat is pull-based: the embedded widget polls
          // GET /channels/website-chat/:channelId/messages and picks up the AI
          // reply that ResponseService already persisted. Nothing to push here.
          return;
        case 'EMAIL': {
          const destination = params.destination;
          if (destination) {
            await this.resendService.sendEmail({
              to: destination,
              subject: 'Update from your AI Employee',
              text: content,
            });
          } else {
            this.logger.log(`[EMAIL no destination] channel=${channelId} content="${content}"`);
          }
          return;
        }
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
  /**
   * Sends a message through the tenant's own channel. Reports the real outcome:
   * `success` is true only when the provider accepted the message. There is no
   * cross-tenant or "global" fallback — a tenant without a connected channel
   * gets a clear failure, never a message sent from someone else's number.
   */
  async dispatchOutbound(params: {
    tenantId?: string;
    recipient: string;
    content: string;
    channelId?: string;
  }): Promise<{ success: boolean; messageId: string | null; status: string; detail?: string }> {
    if (!params.tenantId) {
      return { success: false, messageId: null, status: 'rejected', detail: 'tenantId is required' };
    }

    const channel = params.channelId
      ? await this.prisma.channel.findFirst({ where: { id: params.channelId, tenantId: params.tenantId } })
      : await this.prisma.channel.findFirst({
          where: { tenantId: params.tenantId, type: 'WHATSAPP', status: 'ACTIVE' },
          orderBy: { createdAt: 'asc' },
        });

    if (!channel) {
      return { success: false, messageId: null, status: 'not_configured', detail: 'No active messaging channel is connected for this business.' };
    }
    if (channel.type !== 'WHATSAPP') {
      return { success: false, messageId: null, status: 'unsupported', detail: `Outbound dispatch is not supported for ${channel.type} channels.` };
    }

    try {
      const config = (channel.config ?? {}) as Record<string, unknown>;
      const credential = await this.channelService.getDecryptedCredential(params.tenantId, channel.id);
      const accessToken =
        credential?.type === CredentialType.BEARER_TOKEN && typeof credential.token === 'string' ? credential.token : undefined;

      const sent: unknown = await this.whatsAppAdapter.sendMessage(params.recipient, params.content, {
        phoneNumberId: typeof config.phoneNumberId === 'string' ? config.phoneNumberId : undefined,
        accessToken,
        provider: (config.provider as any) || (process.env.WHATSAPP_PROVIDER as any) || 'waha',
        wahaApiUrl: typeof config.wahaApiUrl === 'string' ? config.wahaApiUrl : undefined,
        wahaApiKey: typeof config.wahaApiKey === 'string' ? config.wahaApiKey : undefined,
        wahaSession: typeof config.wahaSession === 'string' ? config.wahaSession : undefined,
      });
      const providerId = extractMessageId(sent);
      this.logger.log(`dispatchOutbound: tenant=${params.tenantId} channel=${channel.id} delivered${providerId ? ` id=${providerId}` : ''}`);
      return { success: true, messageId: providerId, status: 'sent', detail: 'Accepted by WhatsApp provider' };
    } catch (err: any) {
      this.logger.warn(`dispatchOutbound: tenant=${params.tenantId} channel=${channel.id} failed: ${err.message}`);
      return { success: false, messageId: null, status: 'failed', detail: String(err.message ?? err).slice(0, 300) };
    }
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

/** Best-effort: provider message id from a WhatsApp Cloud API or WAHA send response. */
function extractMessageId(res: unknown): string | null {
  if (!res || typeof res !== 'object') return null;
  const r = res as Record<string, any>;
  return r.messages?.[0]?.id ?? r.id?._serialized ?? (typeof r.id === 'string' ? r.id : null) ?? null;
}
