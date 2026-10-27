import { createHmac, timingSafeEqual } from 'crypto';
import type { LanguageTag } from '../../common/language/language';

/**
 * Twilio ConversationRelay: Twilio runs speech-to-text and text-to-speech and
 * talks to us in text over a WebSocket. This file is the pure part: message
 * parsing and building, TwiML, the spoken-text clean-up and the stream token.
 * https://www.twilio.com/docs/voice/twiml/connect/conversationrelay
 */

export type RelayInbound =
  | { type: 'setup'; callSid: string; from: string; to: string; token: string }
  | { type: 'prompt'; text: string; last: boolean }
  | { type: 'interrupt' }
  | { type: 'dtmf'; digit: string }
  | { type: 'error'; description: string };

/** Parses one WebSocket frame from Twilio. Anything unknown or malformed is null. */
export function parseRelayMessage(raw: string): RelayInbound | null {
  let m: any;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object') return null;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  switch (m.type) {
    case 'setup':
      return {
        type: 'setup',
        callSid: str(m.callSid),
        from: str(m.from),
        to: str(m.to),
        token: str(m.customParameters?.token),
      };
    case 'prompt':
      return { type: 'prompt', text: str(m.voicePrompt).trim(), last: m.last !== false };
    case 'interrupt':
      return { type: 'interrupt' };
    case 'dtmf':
      return { type: 'dtmf', digit: str(m.digit) };
    case 'error':
      return { type: 'error', description: str(m.description) };
    default:
      return null;
  }
}

export const relayText = (token: string) => JSON.stringify({ type: 'text', token, last: true });
export const relayEnd = (handoffData?: Record<string, unknown>) =>
  JSON.stringify(handoffData ? { type: 'end', handoffData: JSON.stringify(handoffData) } : { type: 'end' });
export const relayLanguage = (lang: string) => JSON.stringify({ type: 'language', ttsLanguage: lang, transcriptionLanguage: lang });

// ── Spoken text ──────────────────────────────────────────────────────────

const MAX_SPOKEN_CHARS = 600;

/**
 * Chat replies become speech: no markdown, links, emoji or bullets, and short
 * enough to listen to. Cut at a sentence end, never mid-word.
 */
export function toSpeech(text: string): string {
  let t = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[*_`#>~|]+/g, ' ')
    .replace(/^\s*[-•·]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/\p{Extended_Pictographic}|️|‍/gu, '')
    .replace(/\s*\n+\s*/g, '. ')
    .replace(/\s+/g, ' ')
    .replace(/([.!?]\s*)\.\s+/g, '$1')
    .trim();
  if (t.length > MAX_SPOKEN_CHARS) {
    const cut = t.slice(0, MAX_SPOKEN_CHARS);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
    t = end > MAX_SPOKEN_CHARS * 0.4 ? cut.slice(0, end + 1) : cut.slice(0, cut.lastIndexOf(' ')).trimEnd() + '.';
  }
  return t;
}

// ── Languages ────────────────────────────────────────────────────────────

/** Twilio speech language for a conversation language. Singlish is spoken, so English. */
export function speechLanguage(tag: LanguageTag | string | null | undefined, env: NodeJS.ProcessEnv = process.env): string {
  return tag === 'si' ? env.VOICE_LANG_SI?.trim() || 'si-LK' : env.VOICE_LANG_EN?.trim() || 'en-US';
}

// ── TwiML ────────────────────────────────────────────────────────────────

export const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export interface ConnectOptions {
  streamUrl: string;
  actionUrl: string;
  token: string;
  language: string;
  greeting: string;
  ttsProvider: string;
  transcriptionProvider: string;
  voice?: string;
}

export function connectTwiml(o: ConnectOptions): string {
  const attrs: Record<string, string> = {
    url: o.streamUrl,
    language: o.language,
    ttsProvider: o.ttsProvider,
    transcriptionProvider: o.transcriptionProvider,
    welcomeGreeting: o.greeting,
    interruptible: 'true',
    dtmfDetection: 'false',
  };
  if (o.voice) attrs.voice = o.voice;
  const a = Object.entries(attrs).map(([k, v]) => `${k}="${xmlEscape(v)}"`).join(' ');
  return (
    '<?xml version="1.0" encoding="UTF-8"?><Response>' +
    `<Connect action="${xmlEscape(o.actionUrl)}"><ConversationRelay ${a}>` +
    `<Parameter name="token" value="${xmlEscape(o.token)}"/></ConversationRelay></Connect></Response>`
  );
}

export const E164 = /^\+?[0-9]{6,15}$/;

export function dialTwiml(number: string, callerId?: string): string {
  const cid = callerId && E164.test(callerId) ? ` callerId="${xmlEscape(callerId)}"` : '';
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Dial${cid}>${xmlEscape(number)}</Dial></Response>`;
}

export const hangupTwiml = (say?: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><Response>${say ? `<Say>${xmlEscape(say)}</Say>` : ''}<Hangup/></Response>`;

// ── Stream token ─────────────────────────────────────────────────────────

/**
 * The WebSocket is a separate connection from the webhook, so the webhook hands
 * Twilio a short-lived signed token and the first frame must carry it back.
 * That ties each socket to a call whose webhook signature we already checked.
 */
export function signStreamToken(channelId: string, secret: string, ttlMs = 120_000, now = Date.now()): string {
  const body = `${channelId}.${now + ttlMs}`;
  return `${Buffer.from(body).toString('base64url')}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

/** The channel id the token was issued for, or null if it is forged or expired. */
export function verifyStreamToken(token: string, secret: string, now = Date.now()): string | null {
  const [b, sig] = token.split('.');
  if (!b || !sig) return null;
  const body = Buffer.from(b, 'base64url').toString();
  const expected = createHmac('sha256', secret).update(body).digest('base64url');
  const x = Buffer.from(sig);
  const y = Buffer.from(expected);
  if (x.length !== y.length || !timingSafeEqual(x, y)) return null;
  const dot = body.lastIndexOf('.');
  const exp = Number(body.slice(dot + 1));
  return Number.isFinite(exp) && exp > now ? body.slice(0, dot) : null;
}
