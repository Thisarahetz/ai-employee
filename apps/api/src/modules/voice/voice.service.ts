import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { CredentialType, MessageContentType } from '@prisma/client';
import { customerMessage, resolveReplyLanguage } from '../../common/language/language';
import { PrismaService } from '../../prisma/prisma.service';
import { ChannelService } from '../channel/channel.service';
import { ConversationService } from '../conversation/conversation.service';
import { verifyTwilioSignature } from './twilio-signature';
import {
  E164,
  connectTwiml,
  dialTwiml,
  hangupTwiml,
  parseRelayMessage,
  signStreamToken,
  speechLanguage,
  verifyStreamToken,
} from './voice-protocol';
import { VoiceSession, VoiceSessionRegistry, VoiceSocket } from './voice-session.registry';

const SETUP_TIMEOUT_MS = 5_000;

const apiBase = () => (process.env.API_URL || 'http://localhost:3001').replace(/\/$/, '');
const signingSecret = () => process.env.WEBHOOK_SIGNING_SECRET?.trim() || process.env.JWT_ACCESS_SECRET?.trim() || '';
const replyTimeoutMs = () => Number(process.env.VOICE_REPLY_TIMEOUT_MS) || 15_000;

/** Public URL Twilio calls (and signs). Fixed paths, so a proxy cannot change what was signed. */
export const voiceWebhookUrl = (kind: 'incoming' | 'action', channelId: string) =>
  `${apiBase()}/webhooks/voice/twilio/${kind}/${channelId}`;

export function streamUrl(): string {
  const explicit = process.env.VOICE_STREAM_URL?.trim();
  return explicit || `${apiBase().replace(/^http/, 'ws')}/voice/stream`;
}

/**
 * A phone call, end to end: Twilio calls the webhook, we answer with TwiML that
 * opens a ConversationRelay stream (Twilio does speech-to-text and
 * text-to-speech), each thing the caller says goes into the same pipeline as a
 * chat message (Rasa, saved answers, the AI fallback, staff handoff), and the
 * reply is spoken back through VoiceSessionRegistry.
 */
@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelService,
    private readonly conversations: ConversationService,
    private readonly registry: VoiceSessionRegistry,
  ) {}

  private async voiceChannel(channelId: string) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel || channel.type !== 'VOICE') throw new NotFoundException('Voice channel not found');
    return channel;
  }

  /** The channel's own Twilio auth token; the platform one only for a self-hosted single business. */
  private async authToken(channel: { id: string; tenantId: string }): Promise<string> {
    const credential = await this.channels.getDecryptedCredential(channel.tenantId, channel.id);
    if (credential?.type === CredentialType.BEARER_TOKEN && typeof credential.token === 'string') return credential.token;
    return process.env.TWILIO_AUTH_TOKEN?.trim() ?? '';
  }

  private async verifyTwilio(
    channel: { id: string; tenantId: string },
    kind: 'incoming' | 'action',
    params: Record<string, unknown>,
    signature: string | string[] | undefined,
  ) {
    const token = await this.authToken(channel);
    if (!token) {
      if (process.env.NODE_ENV === 'production') {
        this.logger.error(`No Twilio auth token for voice channel ${channel.id}; rejecting call.`);
        throw new UnauthorizedException('Twilio signing is not configured');
      }
      this.logger.warn(`No Twilio auth token for voice channel ${channel.id}; accepting unsigned request (non-production).`);
      return;
    }
    if (!verifyTwilioSignature(voiceWebhookUrl(kind, channel.id), params, signature, token)) {
      throw new UnauthorizedException('Invalid Twilio signature');
    }
  }

  /** Twilio's voice webhook: a call came in. Answers with TwiML that opens the stream. */
  async incoming(channelId: string, params: Record<string, unknown>, signature: string | string[] | undefined) {
    const channel = await this.voiceChannel(channelId);
    await this.verifyTwilio(channel, 'incoming', params, signature);
    if (channel.status !== 'ACTIVE') return hangupTwiml('Sorry, this line is not available right now.');

    const secret = signingSecret();
    if (!secret) throw new UnauthorizedException('Voice signing is not configured');

    const config = (channel.config ?? {}) as Record<string, unknown>;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: channel.tenantId },
      select: { name: true, defaultLanguage: true, matchCustomerLanguage: true },
    });
    const tag = resolveReplyLanguage(null, tenant);
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

    return connectTwiml({
      streamUrl: streamUrl(),
      actionUrl: voiceWebhookUrl('action', channel.id),
      token: signStreamToken(channel.id, secret),
      language: speechLanguage(tag),
      greeting: str(config.greeting) ?? customerMessage('greeting', tag, { business: tenant?.name ?? '' }),
      ttsProvider: str(config.ttsProvider) ?? process.env.VOICE_TTS_PROVIDER?.trim() ?? 'Google',
      transcriptionProvider: str(config.transcriptionProvider) ?? process.env.VOICE_STT_PROVIDER?.trim() ?? 'Google',
      voice: str(config.voice) ?? process.env.VOICE_TTS_VOICE?.trim(),
    });
  }

  /**
   * Twilio calls this when the stream ends. After a handoff, transfer the call to
   * the business's number when one is set; if the stream failed, send the caller to
   * a person rather than dropping them.
   */
  async action(channelId: string, params: Record<string, unknown>, signature: string | string[] | undefined) {
    const channel = await this.voiceChannel(channelId);
    await this.verifyTwilio(channel, 'action', params, signature);

    const config = (channel.config ?? {}) as Record<string, unknown>;
    const transfer = typeof config.transferNumber === 'string' && E164.test(config.transferNumber.trim()) ? config.transferNumber.trim() : null;
    let handoff: { reason?: string } = {};
    try {
      handoff = JSON.parse(String(params.HandoffData ?? '{}')) ?? {};
    } catch {
      /* not ours */
    }
    const failed = String(params.SessionStatus ?? '') === 'failed';
    const callerId = typeof params.To === 'string' ? params.To : undefined;
    if (transfer && (handoff.reason === 'handoff' || failed)) return dialTwiml(transfer, callerId);
    return hangupTwiml();
  }

  /** One WebSocket from Twilio. The first frame must be a valid `setup`. */
  openCall(socket: VoiceSocket) {
    let session: VoiceSession | undefined;
    // Setup and what the caller says run strictly in order, one at a time, even
    // when frames arrive back to back while setup is still reading the database.
    let queue: Promise<void> = Promise.resolve();
    const enqueue = (job: () => Promise<void>) => {
      queue = queue.then(job).catch((err) => this.logger.error(`Voice call step failed: ${(err as Error).message}`));
    };
    const setupTimer = setTimeout(() => socket.close(), SETUP_TIMEOUT_MS);

    const onMessage = async (raw: string) => {
      const msg = parseRelayMessage(raw);
      if (!msg) return;
      if (msg.type === 'setup') {
        clearTimeout(setupTimer);
        enqueue(async () => {
          if (session) return;
          session = await this.setup(socket, msg).catch((err) => {
            this.logger.warn(`Voice setup rejected: ${(err as Error).message}`);
            return undefined;
          });
          if (!session) socket.close();
        });
      } else if (msg.type === 'prompt') {
        if (!msg.last || !msg.text) return;
        enqueue(async () => {
          if (session) await this.turn(session, msg.text);
        });
      } else if (msg.type === 'error') {
        this.logger.warn(`Twilio reported a voice error on call ${session?.callSid ?? '(before setup)'}: ${msg.description}`);
      }
    };

    const onClose = async () => {
      clearTimeout(setupTimer);
      await queue;
      if (!session) return;
      this.registry.remove(session);
      await this.closeConversation(session).catch((err) => this.logger.warn(`Closing call conversation failed: ${(err as Error).message}`));
    };

    return { onMessage, onClose };
  }

  private async setup(socket: VoiceSocket, msg: Extract<ReturnType<typeof parseRelayMessage>, { type: 'setup' }>) {
    const secret = signingSecret();
    const channelId = secret ? verifyStreamToken(msg.token, secret) : null;
    if (!channelId) throw new Error('missing, forged or expired stream token');
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel || channel.type !== 'VOICE' || channel.status !== 'ACTIVE') throw new Error('voice channel unavailable');
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: channel.tenantId },
      select: { defaultLanguage: true, matchCustomerLanguage: true },
    });
    const tag = resolveReplyLanguage(null, tenant);
    const session: VoiceSession = {
      callSid: msg.callSid,
      channelId,
      tenantId: channel.tenantId,
      // A withheld number has no stable identity: treat each such call as its own customer.
      caller: E164.test(msg.from) ? msg.from : `call:${msg.callSid}`,
      socket,
      tag,
      speechLang: speechLanguage(tag),
    };
    this.registry.register(session);
    return session;
  }

  /** The caller said something: it goes through the same pipeline as a chat message. */
  private async turn(session: VoiceSession, text: string) {
    const channel = await this.prisma.channel.findUnique({ where: { id: session.channelId } });
    if (!channel) return;
    // If nothing answers in time, say so instead of leaving silence on the line.
    if (session.replyTimer) clearTimeout(session.replyTimer);
    session.replyTimer = setTimeout(() => this.registry.speak(session, customerMessage('voice_slow', session.tag)), replyTimeoutMs());
    try {
      const result = await this.conversations.ingestInboundMessage({
        tenantId: session.tenantId,
        businessId: channel.businessId ?? undefined,
        channelId: session.channelId,
        customerExternalId: session.caller,
        content: text.slice(0, 1000),
        contentType: MessageContentType.TEXT,
      });
      session.conversationId = result.conversationId;
    } catch (err) {
      if (session.replyTimer) clearTimeout(session.replyTimer);
      throw err;
    }
  }

  /** A finished call is a finished conversation, unless staff still have to act on it. */
  private async closeConversation(session: VoiceSession) {
    if (!session.conversationId) return;
    const waiting = await this.prisma.humanHandoff.findFirst({
      where: { tenantId: session.tenantId, conversationId: session.conversationId, status: { in: ['PENDING', 'ACTIVE'] } },
      select: { id: true },
    });
    if (waiting) return;
    await this.prisma.conversation.updateMany({
      where: { id: session.conversationId, tenantId: session.tenantId, status: { in: ['OPEN', 'AI_HANDLING'] } },
      data: { status: 'CLOSED' },
    });
  }
}
