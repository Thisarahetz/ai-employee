import { Body, Controller, ForbiddenException, Get, HttpCode, Logger, NotFoundException, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { MessageContentType } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermissions } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantContext } from '../../common/tenant/tenant-context';
import { verifyHmacSignature } from '../../common/crypto/webhook-signature';
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
  async receive(@Body() body: unknown, @Req() req: Request & { rawBody?: Buffer }): Promise<{ received: boolean }> {
    // Meta signs every delivery with the app secret (X-Hub-Signature-256).
    const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
    if (appSecret) {
      if (!verifyHmacSignature(req.rawBody, req.headers['x-hub-signature-256'], appSecret, 'sha256')) {
        throw new UnauthorizedException('Invalid webhook signature');
      }
    } else if (process.env.NODE_ENV === 'production') {
      this.logger.error('WHATSAPP_APP_SECRET is not set; rejecting unsigned WhatsApp webhook.');
      throw new UnauthorizedException('Webhook signing is not configured');
    }
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
   * WAHA inbound webhook (https://waha.devlike.pro/). Each tenant's WhatsApp
   * channel stores its own WAHA session name (`config.wahaSession`); messages
   * are routed ONLY to the channel owning the session in the payload. Unknown
   * sessions are dropped. Deliveries are authenticated with WAHA's HMAC
   * (X-Webhook-Hmac, sha512) using WAHA_WEBHOOK_HMAC_KEY.
   */
  @Public()
  @Post('waha')
  @HttpCode(200)
  async receiveWaha(@Body() body: any, @Req() req: Request & { rawBody?: Buffer }): Promise<{ received: boolean }> {
    const key = process.env.WAHA_WEBHOOK_HMAC_KEY?.trim();
    if (key) {
      if (!verifyHmacSignature(req.rawBody, req.headers['x-webhook-hmac'], key, 'sha512')) {
        throw new UnauthorizedException('Invalid webhook signature');
      }
    } else if (process.env.NODE_ENV === 'production') {
      this.logger.error('WAHA_WEBHOOK_HMAC_KEY is not set; rejecting unsigned WAHA webhook.');
      throw new UnauthorizedException('Webhook signing is not configured');
    }

    try {
      const normalized = this.whatsAppAdapter.normalizeWahaInbound(body);
      if (!normalized) return { received: true }; // fromMe, non-text, etc.

      const session = typeof body?.session === 'string' ? body.session : '';
      const channel = session ? await this.resolveWahaChannel(session) : null;
      if (!channel) {
        this.logger.warn(`Dropped WAHA message: no active WhatsApp channel owns session "${session || '(none)'}".`);
        return { received: true };
      }

      await this.conversationService.ingestInboundMessage({
        tenantId: channel.tenantId,
        businessId: channel.businessId ?? undefined,
        channelId: channel.id,
        customerExternalId: normalized.externalCustomerId,
        customerName: normalized.customerName,
        content: normalized.content,
        contentType: MessageContentType.TEXT,
      });
    } catch (error: any) {
      this.logger.error(`Failed to process WAHA webhook: ${error.message}`);
    }
    return { received: true };
  }

  /** Session status for one of the caller's own WhatsApp channels. */
  @Get('waha/status')
  @RequirePermissions('channels:manage')
  async getWahaStatus(@CurrentTenant() t: TenantContext, @Query('channelId') channelId: string) {
    const session = await this.ownedSession(t.tenantId, channelId);
    return this.whatsAppAdapter.getWahaSessionStatus(session);
  }

  @Post('waha/start')
  @RequirePermissions('channels:manage')
  async startWahaSession(@CurrentTenant() t: TenantContext, @Query('channelId') channelId: string) {
    const session = await this.ownedSession(t.tenantId, channelId);
    return this.whatsAppAdapter.startWahaSession(session);
  }

  /** Pairing QR — grants control of the WhatsApp number, so owner/admin only. */
  @Get('waha/qr')
  @RequirePermissions('channels:manage')
  async getWahaQr(@CurrentTenant() t: TenantContext, @Res() res: Response, @Query('channelId') channelId: string) {
    const session = await this.ownedSession(t.tenantId, channelId);
    try {
      const qrBuffer = await this.whatsAppAdapter.getWahaQrCode(session);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'no-store');
      res.send(qrBuffer);
    } catch (error: any) {
      res.status(503).json({ error: 'Could not load QR code from WAHA', message: error.message });
    }
  }

  /**
   * WAHA session name for a channel the tenant owns. Defaults to a name derived
   * from the channel id, so two tenants can never share a session.
   */
  private async ownedSession(tenantId: string, channelId: string): Promise<string> {
    if (!channelId) throw new NotFoundException('channelId is required');
    const channel = await this.prisma.channel.findFirst({ where: { id: channelId, tenantId, type: 'WHATSAPP' } });
    if (!channel) throw new NotFoundException('WhatsApp channel not found');
    const config = (channel.config ?? {}) as Record<string, unknown>;
    if (typeof config.wahaSession === 'string' && config.wahaSession) return config.wahaSession;
    const session = `ch_${channel.id}`;
    await this.prisma.channel.update({ where: { id: channel.id }, data: { config: { ...config, provider: 'waha', wahaSession: session } } });
    return session;
  }

  private async resolveWahaChannel(session: string) {
    const channels = await this.prisma.channel.findMany({ where: { type: 'WHATSAPP', status: 'ACTIVE' } });
    return channels.find((c) => (c.config as any)?.wahaSession === session) ?? null;
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
