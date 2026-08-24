/**
 * Shared channel adapter shapes, used both by apps/api's built-in channel modules
 * (whatsapp, ...) and by any future external/custom channel adapter.
 */

export type NormalizedContentType = 'TEXT' | 'IMAGE' | 'FILE' | 'AUDIO' | 'LOCATION';

/** A channel-agnostic inbound message, ready to hand to ConversationService.ingestInboundMessage. */
export interface NormalizedInboundMessage {
  /** e.g. "WHATSAPP", "WEBSITE_CHAT", "EMAIL" — matches ChannelType where applicable. */
  channelType: string;
  /** The customer's identifier in the source channel (phone number, session id, email...). */
  externalCustomerId: string;
  customerName?: string;
  content: string;
  contentType: NormalizedContentType;
  /** Original, unmodified payload — kept for debugging / audit, not required downstream. */
  raw?: unknown;
}

/** Interface every channel adapter (built-in or third-party) should implement. */
export interface ChannelAdapter {
  readonly type: string;
  /** Turn a raw channel-specific webhook payload into the shared shape. */
  normalizeInbound(rawPayload: unknown): NormalizedInboundMessage;
  /** Send a message out through this channel to `destination` (phone/email/session id...). */
  sendOutbound(destination: string, content: string): Promise<void>;
}
