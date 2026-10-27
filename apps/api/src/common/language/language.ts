/**
 * Customer language support: English, Sinhala (සිංහල script) and Singlish
 * (Sinhala typed with English letters, very common on WhatsApp in Sri Lanka).
 *
 * Detection is deterministic and free (no model call) so it can run on every
 * inbound message. The model itself understands all three; what this module
 * decides is which language the AI must REPLY in and which fixed messages
 * (handoff notices, error notices) the customer gets.
 */

/** BCP-47 style tags. `si-Latn` = Singlish. */
export type LanguageTag = 'en' | 'si' | 'si-Latn';
/** Languages a business can pick as its default. */
export type BusinessLanguage = 'en' | 'si';

export const LANGUAGE_TAGS: LanguageTag[] = ['en', 'si', 'si-Latn'];
export const BUSINESS_LANGUAGES: BusinessLanguage[] = ['en', 'si'];

export const LANGUAGE_LABELS: Record<LanguageTag, string> = {
  en: 'English',
  si: 'Sinhala',
  'si-Latn': 'Singlish',
};

export interface Detection {
  language: LanguageTag;
  /**
   * strong = clearly this language (switch the conversation to it).
   * weak   = a hint only (short "ok", "thanks", a single loan word) — used when
   *          we know nothing yet, never to switch away from a known language.
   */
  strength: 'strong' | 'weak';
}

const SINHALA_CHAR = /[඀-෿]/g;
const LATIN_LETTER = /[A-Za-z]/g;

/**
 * Words that are Sinhala written in English letters and are not (common)
 * English words. Several spellings each, because Singlish has no standard.
 */
const SINGLISH_STRONG = new Set(
  (
    'kohomada kohomda kohomed mokakda mokadda mokada monawada monawd monada koheda kawadada kiyada keeyada kiyak keeyak kiyatada kiyatda ' +
    'puluwanda puluwan puluwanne puluvan puluwand karanna karanne karanawa karanava karannada karannako karanako karala kala karapu ' +
    'kiyanna kiyannako kiyala kiwwa thiyenawa tiyenawa thiyanawa thiyenawada tiyenawada thiyenne tiyenne thibba thiyeda tiyeda ' +
    'ona oney onee oni onida mata mage magen oya oyaa oyage oyata oyala apita apata ' +
    'dawase dawasa dawasata heta adha lankawe salli ganana gana ganan ekak ekka ekata ' +
    'nehe naha nedda neda nadda nathnam nathi nethi thiyenawanam hari harida harii hondai hondata hodata hoda ' +
    'ayubowan ayubovan sthuthi sthuthiyi isthuthi isthuthiyi istuti stuthi bohoma godak poddak tikak tikkak ' +
    'welawa welawata welawak wenna wenawa wenawada wenakota kalin passe passata gihin enna ennam ennada yanna yannam ' +
    'balanna balamu denna dennako dennam dennada ganna gannako gannam therenne therune therenawa ' +
    'mokak mokuth kauda kawda koheda thama thawa tawa widihata widiyata nisa nisaa saha ' +
    'machan malli akke ayye nangi aiye ammo aiyo aney'
  ).split(/\s+/),
);

/** Singlish words that also look like English ("ow", "ane") — hints only. */
const SINGLISH_WEAK = new Set('ow ov ane ne eka ada ela api ape mama wage koi'.split(' '));

const stripNoise = (text: string) =>
  text
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, ' ')
    .replace(/[0-9]+/g, ' ');

/**
 * Detects the language of one customer message. Returns null when there is
 * nothing to go on (a phone number, an emoji, "?").
 */
export function detectLanguage(raw: string | null | undefined): Detection | null {
  if (!raw) return null;
  const text = stripNoise(raw);
  const sinhala = (text.match(SINHALA_CHAR) ?? []).length;
  const latin = (text.match(LATIN_LETTER) ?? []).length;

  if (sinhala >= 2 && sinhala >= (sinhala + latin) * 0.2) {
    return { language: 'si', strength: sinhala >= 3 ? 'strong' : 'weak' };
  }

  const words = text
    .toLowerCase()
    .split(/[^a-z']+/)
    .filter((w) => w.length > 0);
  if (!words.length) return null;

  let strong = 0;
  let weak = 0;
  for (const w of words) {
    if (SINGLISH_STRONG.has(w)) strong++;
    else if (SINGLISH_WEAK.has(w)) weak++;
  }

  if (strong >= 2 || (strong === 1 && (words.length <= 4 || weak >= 1))) {
    return { language: 'si-Latn', strength: 'strong' };
  }
  if (strong === 1 || (weak >= 1 && words.length <= 2)) {
    return { language: 'si-Latn', strength: 'weak' };
  }
  if (latin < 2) return null;
  return { language: 'en', strength: words.length >= 3 ? 'strong' : 'weak' };
}

/**
 * The conversation's language after a new customer message: a strong signal
 * switches it, a weak one only fills it in when nothing is known yet. So a
 * Sinhala-speaking customer replying "ok" or "thanks" stays in Sinhala.
 */
export function nextConversationLanguage(current: string | null | undefined, message: string): LanguageTag | null {
  const known = isLanguageTag(current) ? current : null;
  const d = detectLanguage(message);
  if (!d) return known;
  if (d.strength === 'strong' || !known) return d.language;
  return known;
}

export function isLanguageTag(v: unknown): v is LanguageTag {
  return typeof v === 'string' && (LANGUAGE_TAGS as string[]).includes(v);
}

export function isBusinessLanguage(v: unknown): v is BusinessLanguage {
  return typeof v === 'string' && (BUSINESS_LANGUAGES as string[]).includes(v);
}

export interface TenantLanguageSettings {
  defaultLanguage: string | null | undefined;
  matchCustomerLanguage: boolean | null | undefined;
}

/** Which language the AI must answer this conversation in. */
export function resolveReplyLanguage(
  conversationLanguage: string | null | undefined,
  settings: TenantLanguageSettings | null | undefined,
): LanguageTag {
  const fallback: LanguageTag = isBusinessLanguage(settings?.defaultLanguage) ? settings!.defaultLanguage : 'en';
  if (settings?.matchCustomerLanguage === false) return fallback;
  return isLanguageTag(conversationLanguage) ? conversationLanguage : fallback;
}

/**
 * Prompt instruction appended to every customer-facing agent. Kept as three
 * fixed strings so the system prompt stays cacheable per language.
 */
export function replyLanguageInstruction(lang: LanguageTag): string {
  switch (lang) {
    case 'si':
      return [
        'REPLY LANGUAGE — SINHALA:',
        '- Reply ONLY in Sinhala written in Sinhala script (සිංහල), even though these instructions and the business information are in English.',
        '- Use natural, polite, everyday Sri Lankan Sinhala, the way a friendly receptionist talks — not stiff literary Sinhala. Address the customer as "ඔබ".',
        '- Common English words Sri Lankans use as-is (booking, appointment, facial, haircut, package, WhatsApp) may stay in English.',
        '- Copy names of services, products, people and places, prices, phone numbers, emails and links exactly as they appear in the information you have.',
        '- Write prices as "රු. 2,500" and times as "ප.ව. 3.00" (afternoon/evening) or "පෙ.ව. 10.30" (morning).',
        '- Switch to English only if the customer starts writing in English.',
      ].join('\n');
    case 'si-Latn':
      return [
        'REPLY LANGUAGE — SINGLISH:',
        '- The customer writes Sinhala using English letters (Singlish). Reply the same way: casual, polite Sinhala typed in English letters.',
        '- Example style: "Ow, heta 3.00 PM ta booking ekak danna puluwan. Oyage nama saha phone number eka evanna puluwanda?"',
        '- Do NOT use Sinhala script and do NOT switch to plain English, unless the customer does.',
        '- Copy names of services, prices, phone numbers, emails and links exactly as they appear in the information you have.',
      ].join('\n');
    default:
      return 'REPLY LANGUAGE: Reply in English. If the customer writes in Sinhala or Singlish, reply in that language instead.';
  }
}

/** Fixed customer-facing messages the system sends without a model. */
export type CustomerMessageKey =
  | 'handoff_connected'
  | 'pipeline_error'
  | 'request_rolled_back'
  | 'action_fallback'
  | 'ask_phone'
  | 'ask_time'
  | 'greeting'
  | 'thanks'
  | 'goodbye'
  | 'handoff_no_answer'
  | 'clarify'
  | 'voice_slow'
  | 'voice_callback';

const CUSTOMER_MESSAGES: Record<CustomerMessageKey, Record<LanguageTag, string>> = {
  handoff_connected: {
    en: "I've connected you with our team. A representative will assist you shortly.",
    si: 'ඔබව අපේ කණ්ඩායමට සම්බන්ධ කළා. අපේ නියෝජිතයෙක් ඉක්මනින්ම ඔබට උදව් කරයි.',
    'si-Latn': 'Oyawa ape team ekata connect kala. Ape kenek ikmanata oyata udaw karai.',
  },
  pipeline_error: {
    en: "I'm sorry, I encountered an issue processing your request. A team member has been notified and will assist you shortly.",
    si: 'සමාවෙන්න, ඔබගේ ඉල්ලීම සැකසීමේදී ගැටලුවක් ඇති වුණා. අපේ කණ්ඩායමට දැනුම් දුන්නා, ඔවුන් ඉක්මනින්ම ඔබට උදව් කරයි.',
    'si-Latn': 'Samawenna, oyage request eka process karaddi aulak awa. Ape team ekata kiwwa, eyala ikmanata oyata udaw karai.',
  },
  request_rolled_back: {
    en: "I've rolled back and cancelled the previous request for you. Let me know if there is anything else I can help with!",
    si: 'කලින් ඉල්ලීම අවලංගු කළා. තවත් උදව්වක් අවශ්‍ය නම් කියන්න!',
    'si-Latn': 'Kalin request eka cancel kala. Thawa monawa hari udawwak ona nam kiyanna!',
  },
  action_fallback: {
    en: "I've noted your request and a team member will follow up shortly to confirm the details.",
    si: 'ඔබගේ ඉල්ලීම සටහන් කර ගත්තා. විස්තර තහවුරු කරන්න අපේ කණ්ඩායමේ කෙනෙක් ඉක්මනින් ඔබව සම්බන්ධ කර ගනීවි.',
    'si-Latn': 'Oyage request eka note kara gaththa. Details confirm karanna ape team eke kenek ikmanata oyawa contact karai.',
  },
  ask_phone: {
    en: 'To complete your booking, could you please provide your phone number?',
    si: 'ඔබගේ booking එක සම්පූර්ණ කරන්න, කරුණාකර ඔබගේ දුරකථන අංකය ලබා දෙන්න.',
    'si-Latn': 'Booking eka complete karanna, karunakara oyage phone number eka denna puluwanda?',
  },
  greeting: {
    en: 'Hello! Welcome to {business}. How can I help you today?',
    si: 'ආයුබෝවන්! {business} වෙත සාදරයෙන් පිළිගනිමු. අද ඔබට උදව් කරන්නේ කොහොමද?',
    'si-Latn': 'Ayubowan! {business} ekata welcome. Ada oyata mokakda udaw karanna one?',
  },
  thanks: {
    en: "You're welcome! Let us know if there's anything else we can help with.",
    si: 'ඔබව සාදරයෙන් පිළිගනිමු! තවත් උදව්වක් අවශ්‍ය නම් කියන්න.',
    'si-Latn': 'Welcome! Thawa monawa hari udawwak ona nam kiyanna.',
  },
  goodbye: {
    en: 'Goodbye! Message us any time if you need anything.',
    si: 'ආයුබෝවන්! ඕනෑම වෙලාවක අපිට පණිවිඩයක් එවන්න.',
    'si-Latn': 'Bye! Ona welawakata ape ekka katha karanna.',
  },
  handoff_no_answer: {
    en: 'Thank you for your message! A member of our team will reply to you shortly.',
    si: 'ඔබගේ පණිවිඩයට ස්තූතියි! අපේ කණ්ඩායමේ කෙනෙක් ඉක්මනින්ම ඔබට පිළිතුරු දෙයි.',
    'si-Latn': 'Oyage message ekata sthuthi! Ape team eke kenek ikmanata oyata reply karai.',
  },
  clarify: {
    en: "Sorry, I didn't quite catch that. Could you say it again in a different way?",
    si: 'සමාවෙන්න, මට හරියටම තේරුණේ නැහැ. ඔබට ආයෙත් වෙනත් විදියකට කියන්න පුළුවන්ද?',
    'si-Latn': 'Samawenna, mata hariyatama therune na. Oyata aye wenath widihakata kiyanna puluwanda?',
  },
  voice_slow: {
    en: "Sorry, that's taking longer than expected. Could you please say that again?",
    si: 'සමාවෙන්න, ටිකක් වෙලා යනවා. කරුණාකර ආයෙත් කියන්න පුළුවන්ද?',
    'si-Latn': 'Samawenna, tikak welawa yanawa. Karunakara aye kiyanna puluwanda?',
  },
  voice_callback: {
    en: "I've passed your request to our team, and someone will get back to you soon. Thank you for calling.",
    si: 'ඔබගේ ඉල්ලීම අපේ කණ්ඩායමට යොමු කළා, ඉක්මනින්ම කෙනෙක් ඔබව සම්බන්ධ කර ගනීවි. ඇමතුමට ස්තූතියි.',
    'si-Latn': 'Oyage request eka ape team ekata yomu kala, ikmanata kenek oyawa contact karai. Call ekata sthuthi.',
  },
  ask_time: {
    en: 'What time would you prefer for your appointment?',
    si: 'ඔබගේ appointment එකට කැමති වේලාව කීයද?',
    'si-Latn': 'Appointment ekata kamathi welawa kiyatada?',
  },
};

export function customerMessage(
  key: CustomerMessageKey,
  lang: LanguageTag | null | undefined,
  vars: Record<string, string> = {},
): string {
  const set = CUSTOMER_MESSAGES[key];
  const text = set[lang && isLanguageTag(lang) ? lang : 'en'];
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => vars[name] ?? (name === 'business' ? 'us' : whole));
}

/**
 * True when a reply claims an appointment is booked/confirmed, in any of the
 * three languages. Used to catch a model claiming a booking that no tool made.
 */
export function claimsBooking(reply: string): boolean {
  const english =
    /successfully booked|appointment has been (successfully )?booked|appointment is booked|appointment has been confirmed|booking (is|has been) confirmed|we look forward to seeing you/i;
  // Sinhala past/perfect forms of "booked / reserved / confirmed" (not "can book" / "shall I book").
  const notSinhalaAfter = '(?![\\u0D80-\\u0DFF])';
  const sinhala = new RegExp(
    [
      `(වෙන්|බුක්|book|confirm|තහවුරු)\\s*(කළා|කරලා\\s*(තියෙනවා|තිබෙනවා|ඉවරයි)|කරා${notSinhalaAfter}|කර\\s*(ඇත|ඇති|තියෙනවා|තිබෙනවා|තිබේ|ගත්තා|දුන්නා|ගෙන\\s*ඇත)|කරන\\s*ලදී|වුණා|උණා|විය)`,
      'ඔබව\\s*බලාපොරොත්තු',
    ].join('|'),
    'i',
  );
  const singlish = /\b(book|confirm|wen)\s*(kala|kalaa|kara\s*(gaththa|thiyenawa|tiyenawa|dunna)|karala\s*(thiyenawa|tiyenawa|iwarai)|karapu|una|wuna)\b/i;
  return english.test(reply) || sinhala.test(reply) || singlish.test(reply);
}

/** Customer asks to cancel/undo what was just done (English, Sinhala, Singlish). */
export function wantsRollback(message: string): boolean {
  return (
    /\b(undo|rollback|never mind|cancel that|cancel previous|cancel appointment)\b/i.test(message) ||
    /(අවලංගු\s*කරන්න|අවලංගු\s*කරලා\s*දෙන්න|cancel\s*කරන්න|cancel\s*කරලා\s*දෙන්න)/i.test(message) ||
    /\b(cancel|awalangu)\s*(karanna|karannako|karala\s*denna|karanako)\b/i.test(message)
  );
}
