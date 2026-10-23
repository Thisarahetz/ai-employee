/**
 * Matches a customer message against saved answers WITHOUT any AI provider.
 *
 * Works for English, Sinhala script and Singlish (Sinhala typed in English
 * letters). Customers spell Singlish many ways ("kohomada", "kohomeda",
 * "kohomda") and Sinhala words take endings ("මිල" / "මිලද"), so matching is
 * fuzzy: a phonetic key per word, small typos allowed, word-stem prefixes, plus
 * a character-trigram score for the whole sentence.
 */
import type { LanguageTag } from '../language/language';

export interface MatchableAnswer {
  id: string;
  questions: string[];
  answerEn: string;
  answerSi: string;
  answerSiLatn: string;
}

export interface AnswerMatch<T extends MatchableAnswer = MatchableAnswer> {
  answer: T;
  /** 0..1 — how closely the message matches the best question of this answer. */
  score: number;
  /** The saved question that matched best. */
  question: string;
}

/** Score at which a saved answer is sent as the reply. */
export const DIRECT_MATCH_SCORE = 0.7;
/** Score at which a saved answer is given to the AI as an approved fact. */
export const HINT_MATCH_SCORE = 0.35;

// Words that carry no meaning for matching: articles, pronouns, politeness,
// greetings and Singlish/Sinhala fillers. Question words (what, when, how much)
// are kept on purpose: they separate "what time" from "what price".
const STOP_WORDS = new Set([
  // English
  'a', 'an', 'the', 'is', 'are', 'am', 'was', 'be', 'do', 'does', 'did', 'can', 'could', 'would', 'will',
  'please', 'pls', 'plz', 'i', 'im', 'you', 'your', 'u', 'ur', 'we', 'our', 'us', 'me', 'my', 'to', 'of',
  'for', 'in', 'on', 'at', 'it', 'its', 'this', 'that', 'there', 'any', 'have', 'has', 'and', 'or', 'so',
  'just', 'tell', 'know', 'want', 'like', 'some', 'about', 'hi', 'hello', 'hey', 'dear', 'sir', 'madam',
  'miss', 'thanks', 'thank', 'ok', 'okay',
  // Singlish fillers and greetings
  'ayubowan', 'ayubovan', 'da', 'de', 'ne', 'neda', 'nede', 'ah', 'aa', 'eka', 'ekak', 'mata', 'mama',
  'oya', 'oyage', 'oyala', 'oyalage', 'api', 'ape', 'karunakara', 'kiyanna', 'puluwanda', 'puluwan',
  // Sinhala particles and greetings
  'ද', 'ආයුබෝවන්', 'හලෝ', 'හායි', 'මට', 'මම', 'ඔයා', 'ඔබ', 'ඔබේ', 'ඔබගේ', 'අපි', 'අපේ', 'කරුණාකර',
  'කියන්න', 'පුළුවන්ද', 'පුළුවන්', 'එක', 'එකක්',
]);

const SINHALA = /[඀-෿]/;

/** Lowercase, drop punctuation/emoji and invisible joiners, keep letters and digits. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[​-‍﻿]/g, '')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Sound-alike key for a Latin word, so Singlish spelling variants and common
 * English typos land on the same key: th→t, w→v, c/q/ck→k, doubled letters
 * collapsed, long vowels shortened.
 */
export function phoneticKey(word: string): string {
  if (SINHALA.test(word)) return word;
  return word
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
    .replace(/[cq]/g, 'k')
    .replace(/([tdsk])h/g, '$1')
    .replace(/w/g, 'v')
    .replace(/z/g, 's')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/(.)\1+/g, '$1');
}

export function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(' ')
    .filter((w) => w && !STOP_WORDS.has(w))
    .map(phoneticKey)
    .filter((w) => w.length > 0);
}

function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]!);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

/** Same word allowing a typo, or the same stem with a different ending. */
export function wordsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  // Endings: "price"/"prices", "booking"/"book", "මිල"/"මිලද", "velava"/"velavata".
  if (shorter.length >= 3 && longer.startsWith(shorter) && longer.length - shorter.length <= 3) return true;
  // Singlish typed without vowels: "krnne" = "karanne", "mnvd" = "monavada".
  if (!SINHALA.test(a) && a[0] === b[0]) {
    const vowels = (w: string) => (w.match(/[aeiou]/g) ?? []).length;
    const skeleton = (w: string) => w.replace(/[aeiouy]/g, '');
    if (Math.min(vowels(a), vowels(b)) <= 1 && skeleton(a).length >= 3 && skeleton(a) === skeleton(b)) return true;
  }
  // Typos: typos rarely hit the first letter, and that keeps "hair" apart from "pair".
  if (shorter.length < 4 || a[0] !== b[0]) return false;
  const allowed = longer.length > 6 ? 2 : 1;
  return editDistance(a, b, allowed) <= allowed;
}

function trigrams(text: string): Set<string> {
  const s = ` ${text} `;
  const out = new Set<string>();
  for (let i = 0; i < s.length - 2; i++) out.add(s.slice(i, i + 3));
  return out;
}

function dice(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let both = 0;
  for (const g of a) if (b.has(g)) both++;
  return (2 * both) / (a.size + b.size);
}

/** How well a customer message matches one saved question (0..1). */
export function scoreQuestion(message: string, question: string): number {
  const mTokens = tokenize(message);
  const qTokens = tokenize(question);
  if (!mTokens.length || !qTokens.length) return 0;
  if (mTokens.join(' ') === qTokens.join(' ')) return 1;

  const qCovered = qTokens.filter((q) => mTokens.some((m) => wordsMatch(m, q))).length / qTokens.length;
  const mCovered = mTokens.filter((m) => qTokens.some((q) => wordsMatch(m, q))).length / mTokens.length;
  const charSim = dice(trigrams(mTokens.join(' ')), trigrams(qTokens.join(' ')));

  // Mostly "does the message contain what the saved question asks", lightly
  // penalising messages that also ask about other things.
  let score = 0.55 * qCovered + 0.25 * mCovered + 0.2 * charSim;
  // A one-word saved question ("price") must not swallow every long message.
  if (qTokens.length === 1 && mTokens.length > 3) score *= 0.75;
  return Math.min(1, score);
}

export function findBestAnswer<T extends MatchableAnswer>(message: string, answers: T[]): AnswerMatch<T> | null {
  let best: AnswerMatch<T> | null = null;
  for (const answer of answers) {
    for (const question of answer.questions) {
      const score = scoreQuestion(message, question);
      if (!best || score > best.score) best = { answer, score, question };
    }
  }
  return best && best.score > 0 ? best : null;
}

/**
 * The answer text in the customer's language. `exact` is false when that
 * language was not filled in and another one is used instead.
 */
export function answerInLanguage(
  answer: Pick<MatchableAnswer, 'answerEn' | 'answerSi' | 'answerSiLatn'>,
  lang: LanguageTag,
): { text: string; exact: boolean } {
  const byLang: Record<LanguageTag, string> = {
    en: answer.answerEn.trim(),
    si: answer.answerSi.trim(),
    'si-Latn': answer.answerSiLatn.trim(),
  };
  if (byLang[lang]) return { text: byLang[lang], exact: true };
  // Sinhala readers manage Singlish and the reverse better than English.
  const order: LanguageTag[] = lang === 'si' ? ['si-Latn', 'en'] : lang === 'si-Latn' ? ['si', 'en'] : ['si-Latn', 'si'];
  for (const l of order) if (byLang[l]) return { text: byLang[l], exact: false };
  return { text: '', exact: false };
}

// Booking-type requests need the AI's tools (or a person); a saved answer can't do them.
const ACTION_WORDS =
  /\b(book|booking|appointment|reserve|reservation|schedule|reschedule|cancel|change\s+my|slot|available\s+(at|on|tomorrow|today))\b|වෙන්\s*කර|වෙන්කර|අවලංගු|appointment\s*එක|booking\s*එක|\b(book|appointment|cancel)\s*(karanna|karanava|karala|ekak|eka)\b/iu;

export function looksLikeActionRequest(message: string): boolean {
  return ACTION_WORDS.test(message);
}

/** Message is only a greeting (no question attached). */
const GREETING_ONLY =
  /^(hi|hello|hey|heyy+|hiya|good\s+(morning|afternoon|evening|day)|ayubowan|ayubovan|ආයුබෝවන්|හලෝ|හෙලෝ|හායි|සු[භබ]\s*(උදෑසනක්|දවසක්|සන්ධ්‍යාවක්))(\s+(there|everyone|all|sir|madam))?[\s.!?,🙂😊👋]*$/iu;
const THANKS_ONLY =
  /^((thanks|thank\s+you|thx|ty|many\s+thanks)(\s+(so|very)?\s*much|\s+a\s+lot)?|much\s+appreciated|cheers|((bohoma|godak)\s*)?(i?sthuthi(yi)?|istuti|stuthi)(\s*(bohoma|godak))?|((බොහොම|ගොඩක්)\s*)?ස්ත[ූු]තියි?(\s*(බොහොම|ගොඩක්))?)[\s.!?,🙏🙂😊]*$/iu;

export function quickReplyKind(message: string): 'greeting' | 'thanks' | null {
  const t = message.trim();
  if (GREETING_ONLY.test(t)) return 'greeting';
  if (THANKS_ONLY.test(t)) return 'thanks';
  return null;
}
