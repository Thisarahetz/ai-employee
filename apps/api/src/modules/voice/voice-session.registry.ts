import { Injectable, Logger } from '@nestjs/common';
import { customerMessage, isLanguageTag, LanguageTag } from '../../common/language/language';
import { relayEnd, relayLanguage, relayText, speechLanguage, toSpeech } from './voice-protocol';

export interface VoiceSocket {
  send(data: string): void;
  close(): void;
}

export interface VoiceSession {
  callSid: string;
  channelId: string;
  tenantId: string;
  /** The caller's number (or a per-call id when the number is withheld). */
  caller: string;
  socket: VoiceSocket;
  /** Conversation language the call is currently spoken in. */
  tag: LanguageTag;
  /** Twilio speech language last sent (en-US, si-LK). */
  speechLang: string;
  conversationId?: string;
  replyTimer?: NodeJS.Timeout;
  endTimer?: NodeJS.Timeout;
  ending?: boolean;
}

export interface VoiceDelivery {
  channelId: string;
  /** The caller's number, as stored on the customer. */
  destination?: string;
  content: string;
  replySource?: string;
  /** Conversation language of the reply. */
  language?: string | null;
  /** True when the channel has a number to transfer to. */
  canTransfer?: boolean;
}

/** Rough time to speak `text`, so the call is not ended over its last words. */
export function speakingMs(text: string): number {
  const fixed = Number(process.env.VOICE_HANDOFF_END_DELAY_MS);
  if (Number.isFinite(fixed) && fixed >= 0 && process.env.VOICE_HANDOFF_END_DELAY_MS) return fixed;
  return Math.min(15_000, 1_200 + text.length * 70);
}

/**
 * The live phone calls on this server. Replies reach the caller through here:
 * the normal reply pipeline persists and "sends" the message to the channel,
 * and for a voice channel that means speaking it on the call that is open.
 */
@Injectable()
export class VoiceSessionRegistry {
  private readonly logger = new Logger(VoiceSessionRegistry.name);
  private readonly sessions = new Map<string, VoiceSession>();

  private key(channelId: string, caller: string) {
    return `${channelId}:${caller}`;
  }

  get size() {
    return this.sessions.size;
  }

  register(session: VoiceSession) {
    const key = this.key(session.channelId, session.caller);
    const previous = this.sessions.get(key);
    // The same number calling again: the older socket is a dead or stale call.
    if (previous && previous !== session) {
      this.clearTimers(previous);
      previous.socket.close();
    }
    this.sessions.set(key, session);
  }

  remove(session: VoiceSession) {
    this.clearTimers(session);
    const key = this.key(session.channelId, session.caller);
    if (this.sessions.get(key) === session) this.sessions.delete(key);
  }

  find(channelId: string, caller: string | undefined) {
    return caller ? this.sessions.get(this.key(channelId, caller)) : undefined;
  }

  private clearTimers(s: VoiceSession) {
    if (s.replyTimer) clearTimeout(s.replyTimer);
    if (s.endTimer) clearTimeout(s.endTimer);
    s.replyTimer = s.endTimer = undefined;
  }

  /** Speaks a reply on the caller's open call. False when there is no call (it ended). */
  deliver(d: VoiceDelivery): boolean {
    const s = this.find(d.channelId, d.destination);
    if (!s || s.ending) return false;
    if (s.replyTimer) clearTimeout(s.replyTimer);
    s.replyTimer = undefined;

    if (isLanguageTag(d.language)) this.setLanguage(s, d.language);

    const handoff = d.replySource === 'handoff';
    // Without a number to transfer to, "I've connected you" would be untrue.
    const text = toSpeech(handoff && !d.canTransfer ? customerMessage('voice_callback', s.tag) : d.content);
    if (text) s.socket.send(relayText(text));

    if (handoff) {
      s.ending = true;
      // Let the last sentence play, then end the session; Twilio then asks us what to do next.
      s.endTimer = setTimeout(() => {
        s.socket.send(relayEnd({ reason: d.canTransfer ? 'handoff' : 'callback', conversationId: s.conversationId }));
      }, speakingMs(text));
    }
    return true;
  }

  /** Says something that is not a reply (a "still working" notice). */
  speak(s: VoiceSession, text: string) {
    const spoken = toSpeech(text);
    if (spoken && !s.ending) s.socket.send(relayText(spoken));
  }

  private setLanguage(s: VoiceSession, tag: LanguageTag) {
    s.tag = tag;
    const lang = speechLanguage(tag);
    if (lang !== s.speechLang) {
      s.speechLang = lang;
      s.socket.send(relayLanguage(lang));
    }
  }
}
