import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ChannelAdapter, NormalizedInboundMessage } from '@ai-employee/channel-sdk';

/**
 * Per-channel WhatsApp Cloud API credentials, resolved by
 * ChannelRegistryService from the Channel's `config` + stored credential.
 * When omitted, the adapter falls back to the global `WHATSAPP_*` env vars
 * (single-tenant / local-dev convenience).
 */
export interface WhatsAppSendAuth {
  phoneNumberId?: string;
  accessToken?: string;
  provider?: 'meta_cloud_api' | 'waha';
  wahaApiUrl?: string;
  wahaApiKey?: string;
  wahaSession?: string;
}

/**
 * WhatsApp adapter supporting both:
 * 1. Meta (Facebook) WhatsApp Cloud API
 * 2. WAHA (WhatsApp HTTP API - https://waha.devlike.pro/)
 */
@Injectable()
export class WhatsAppAdapterService implements ChannelAdapter {
  private readonly logger = new Logger(WhatsAppAdapterService.name);

  readonly type = 'WHATSAPP';

  /**
   * Maps a Meta Cloud API webhook payload's first text message to NormalizedInboundMessage.
   */
  normalizeInbound(rawPayload: unknown): NormalizedInboundMessage {
    const value = (rawPayload as any)?.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];
    if (!message || message.type !== 'text' || !message.text?.body) {
      throw new Error('Payload does not contain a WhatsApp text message');
    }

    const contactName = value?.contacts?.[0]?.profile?.name as string | undefined;

    return {
      channelType: this.type,
      externalCustomerId: message.from,
      customerName: contactName,
      content: message.text.body,
      contentType: 'TEXT',
      raw: rawPayload,
    };
  }

  /**
   * Maps a WAHA webhook payload (`message` event) to NormalizedInboundMessage.
   * Discards messages where `fromMe: true`.
   */
  normalizeWahaInbound(rawPayload: unknown): NormalizedInboundMessage | null {
    const event = (rawPayload as any)?.event;
    const payload = (rawPayload as any)?.payload || rawPayload;

    if (payload?.fromMe === true) {
      return null;
    }

    const body = payload?.body;
    const from = payload?.from;
    if (!body || !from) {
      return null;
    }

    const cleanCustomerId = from.replace(/@c\.us$/, '').replace(/\D/g, '');
    const contactName = payload?._data?.notifyName || payload?.sender?.pushname || cleanCustomerId;

    return {
      channelType: this.type,
      externalCustomerId: cleanCustomerId,
      customerName: contactName,
      content: body,
      contentType: 'TEXT',
      raw: rawPayload,
    };
  }

  async sendOutbound(destination: string, content: string, auth?: WhatsAppSendAuth): Promise<void> {
    const provider =
      auth?.provider ||
      (process.env.WHATSAPP_PROVIDER?.toLowerCase() === 'waha' ? 'waha' : 'meta_cloud_api');

    if (provider === 'waha') {
      await this.sendViaWaha(destination, content, auth);
    } else {
      await this.sendViaMetaCloudApi(destination, content, auth);
    }
  }

  /**
   * Dispatches outbound message via WAHA HTTP API (https://waha.devlike.pro/).
   */
  async sendViaWaha(destination: string, content: string, auth?: WhatsAppSendAuth): Promise<void> {
    const wahaBaseUrl = (
      auth?.wahaApiUrl ||
      process.env.WAHA_API_URL ||
      'http://localhost:3200'
    ).replace(/\/+$/, '');
    const wahaApiKey = auth?.wahaApiKey || process.env.WAHA_API_KEY || 'glowdesk-waha-dev-key';
    const session = auth?.wahaSession || process.env.WAHA_SESSION || 'default';

    const digitsOnly = destination.replace(/\D/g, '');
    const chatId = destination.includes('@') ? destination : `${digitsOnly}@c.us`;

    this.logger.log(`[WAHA Outbound] Sending to ${chatId} via session "${session}" on ${wahaBaseUrl}`);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (wahaApiKey) {
        headers['X-Api-Key'] = wahaApiKey;
      }

      await axios.post(
        `${wahaBaseUrl}/api/sendText`,
        {
          session,
          chatId,
          text: content,
        },
        { headers, timeout: 15_000 },
      );
      this.logger.log(`[WAHA Outbound] Delivered successfully to ${chatId}`);
    } catch (error: any) {
      const errDetail = error.response?.data?.error || error.response?.data?.message || error.message;
      this.logger.error(`Failed to send WhatsApp message via WAHA to ${chatId}: ${errDetail}`);
    }
  }

  /**
   * Dispatches outbound message via Meta WhatsApp Cloud API graph endpoint.
   */
  async sendViaMetaCloudApi(destination: string, content: string, auth?: WhatsAppSendAuth): Promise<void> {
    const phoneNumberId = auth?.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = auth?.accessToken || process.env.WHATSAPP_ACCESS_TOKEN;
    if (!phoneNumberId || !accessToken) {
      this.logger.warn(
        'No WhatsApp phoneNumberId/accessToken (channel credential or WHATSAPP_* env); skipping outbound send',
      );
      return;
    }

    try {
      await axios.post(
        `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: destination,
          text: { body: content },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 10_000,
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to send WhatsApp message to ${destination}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Checks session status in WAHA.
   */
  async getWahaSessionStatus(session = 'default') {
    const wahaBaseUrl = (process.env.WAHA_API_URL || 'http://localhost:3200').replace(/\/+$/, '');
    const wahaApiKey = process.env.WAHA_API_KEY || 'glowdesk-waha-dev-key';
    const headers: Record<string, string> = {};
    if (wahaApiKey) headers['X-Api-Key'] = wahaApiKey;

    try {
      const res = await axios.get(`${wahaBaseUrl}/api/sessions/${session}`, { headers, timeout: 5000 });
      return res.data;
    } catch (err: any) {
      return { error: err.response?.data?.error || err.message, status: 'UNAVAILABLE' };
    }
  }

  /**
   * Starts a session in WAHA.
   */
  async startWahaSession(session = 'default') {
    const wahaBaseUrl = (process.env.WAHA_API_URL || 'http://localhost:3200').replace(/\/+$/, '');
    const wahaApiKey = process.env.WAHA_API_KEY || 'glowdesk-waha-dev-key';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (wahaApiKey) headers['X-Api-Key'] = wahaApiKey;

    try {
      const res = await axios.post(`${wahaBaseUrl}/api/sessions/${session}/start`, {}, { headers, timeout: 10_000 });
      return res.data;
    } catch (err: any) {
      // If session doesn't exist, create it first
      try {
        await axios.post(`${wahaBaseUrl}/api/sessions`, { name: session }, { headers, timeout: 10_000 });
        const startRes = await axios.post(
          `${wahaBaseUrl}/api/sessions/${session}/start`,
          {},
          { headers, timeout: 10_000 },
        );
        return startRes.data;
      } catch (innerErr: any) {
        return { error: innerErr.response?.data?.error || innerErr.message };
      }
    }
  }

  /**
   * Retrieves QR code image buffer from WAHA for scanning.
   */
  async getWahaQrCode(session = 'default'): Promise<Buffer> {
    const wahaBaseUrl = (process.env.WAHA_API_URL || 'http://localhost:3200').replace(/\/+$/, '');
    const wahaApiKey = process.env.WAHA_API_KEY || 'glowdesk-waha-dev-key';
    const headers: Record<string, string> = {};
    if (wahaApiKey) headers['X-Api-Key'] = wahaApiKey;

    const res = await axios.get(`${wahaBaseUrl}/api/default/auth/qr`, {
      headers,
      responseType: 'arraybuffer',
      timeout: 10_000,
    });
    return Buffer.from(res.data);
  }

  /** Convenience alias — this is what ChannelRegistryService calls. */
  sendMessage(toPhoneNumber: string, content: string, auth?: WhatsAppSendAuth): Promise<void> {
    return this.sendOutbound(toPhoneNumber, content, auth);
  }
}
