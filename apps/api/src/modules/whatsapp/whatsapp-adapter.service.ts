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
}

/**
 * Meta (Facebook) WhatsApp Cloud API adapter. Inbound normalization mirrors the payload
 * shape WhatsAppController's webhook handler already sanity-checks before calling this;
 * outbound delivery POSTs to the Cloud API's /messages endpoint.
 *
 * Per the same "provider failures must not break core flow" principle used throughout
 * the integration layer (see N8nService, ExternalActionService), sendOutbound/
 * sendMessage swallow their own errors — a WhatsApp delivery failure must not throw back
 * into ResponseService/ChannelRegistryService.
 */
@Injectable()
export class WhatsAppAdapterService implements ChannelAdapter {
  private readonly logger = new Logger(WhatsAppAdapterService.name);

  readonly type = 'WHATSAPP';

  /**
   * Maps a Meta Cloud API webhook payload's first text message
   * (`entry[0].changes[0].value.messages[0]`) to the shared NormalizedInboundMessage
   * shape. Throws if the payload doesn't contain a text message — callers should check
   * the payload shape defensively (as WhatsAppController does) before calling this,
   * since Meta also sends non-message webhook events (status updates, read receipts).
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

  async sendOutbound(destination: string, content: string, auth?: WhatsAppSendAuth): Promise<void> {
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

  /** Convenience alias — this is what ChannelRegistryService calls. */
  sendMessage(toPhoneNumber: string, content: string, auth?: WhatsAppSendAuth): Promise<void> {
    return this.sendOutbound(toPhoneNumber, content, auth);
  }
}
