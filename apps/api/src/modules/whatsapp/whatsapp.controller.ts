import { Body, Controller, ForbiddenException, Get, HttpCode, Logger, Post, Query } from '@nestjs/common';
import { MessageContentType } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { ConversationService } from '../conversation/conversation.service';
import { WhatsAppAdapterService } from './whatsapp-adapter.service';

/**
 * Meta Cloud API webhook endpoints. Both routes are @Public() — Meta calls these
 * directly (the verification handshake + inbound message delivery), there's no
 * logged-in user/tenant JWT on these requests. Tenant/channel resolution instead
 * happens by matching the inbound payload's `phone_number_id` against
 * `Channel.config.phoneNumberId` (see resolveChannel below).
 */
@Controller('webhooks/whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsAppAdapter: WhatsAppAdapterService,
    private readonly conversationService: ConversationService,
  ) {}

  /**
   * Meta's one-time webhook verification handshake (run when configuring the app).
   * The handshake GET carries no phone_number_id, so the token is matched against
   * ANY WHATSAPP channel's `config.verifyToken` (per-tenant setup), falling back
   * to the global `WHATSAPP_VERIFY_TOKEN` env var.
   */
  @Public()
  @Get()
  async verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
  ): Promise<string> {
    if (mode === 'subscribe' && verifyToken && (await this.isKnownVerifyToken(verifyToken))) {
      return challenge;
    }
    throw new ForbiddenException('WhatsApp webhook verification failed');
  }

  private async isKnownVerifyToken(verifyToken: string): Promise<boolean> {
    if (process.env.WHATSAPP_VERIFY_TOKEN && verifyToken === process.env.WHATSAPP_VERIFY_TOKEN) {
      return true;
    }
    const channels = await this.prisma.channel.findMany({ where: { type: 'WHATSAPP' } });
    return channels.some((channel) => (channel.config as any)?.verifyToken === verifyToken);
  }

  /**
   * Inbound message delivery. Always acks 200 (via @HttpCode below and the catch-all
   * below) — Meta retries aggressively on non-200 responses, and a downstream hiccup
   * (unmatched channel, malformed payload, DB error) should never trigger a retry storm.
   * Meta also sends non-message webhook events (status updates, read receipts); these
   * are just no-op'd.
   */
  @Public()
  @Post()
  @HttpCode(200)
  async receive(@Body() body: unknown): Promise<{ received: boolean }> {
    try {
      const value = (body as any)?.entry?.[0]?.changes?.[0]?.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      const message = value?.messages?.[0];
      const hasTextMessage = message?.type === 'text' && Boolean(message?.text?.body);

      if (!phoneNumberId || !hasTextMessage) {
        return { received: true };
      }

      const channel = await this.resolveChannel(phoneNumberId);
      if (!channel) {
        this.logger.warn(`No WhatsApp channel configured for phone_number_id ${phoneNumberId}`);
        return { received: true };
      }

      const normalized = this.whatsAppAdapter.normalizeInbound(body);

      await this.conversationService.ingestInboundMessage({
        tenantId: channel.tenantId,
        businessId: channel.businessId ?? undefined,
        channelId: channel.id,
        customerExternalId: normalized.externalCustomerId,
        customerName: normalized.customerName,
        content: normalized.content,
        contentType: MessageContentType.TEXT,
      });
    } catch (error) {
      this.logger.error(
        `Failed to process WhatsApp webhook: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return { received: true };
  }

  /**
   * Finds the Channel whose config.phoneNumberId matches the inbound webhook's
   * phone_number_id. Prisma JSON-path filtering isn't reliably portable across
   * providers, so this scans WHATSAPP channels in JS rather than querying by JSON path —
   * fine at scaffold scale (typically one row per tenant's WhatsApp number).
   */
  private async resolveChannel(phoneNumberId: string) {
    const channels = await this.prisma.channel.findMany({
      where: { type: 'WHATSAPP', status: 'ACTIVE' },
    });
    return channels.find((channel) => (channel.config as any)?.phoneNumberId === phoneNumberId) ?? null;
  }
}
