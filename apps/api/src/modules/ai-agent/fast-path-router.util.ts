import type { AgentType } from '@prisma/client';
import type { RouteResult } from './router-agent.service';

/**
 * Zero-Token Fast-Path Router (MindStudio Technique 8 & Heuristic Fast-Path)
 *
 * Checks if the inbound customer message matches deterministic, unambiguous patterns
 * (greetings, explicit human handoff, simple gratitude, or in-flight confirmations).
 * When matched, immediately returns a RouteResult with 1.0 confidence without invoking
 * any LLM provider — achieving 0ms overhead, 0 tokens used, and $0.00 cost.
 */
const GREETING_REGEX = /^(hi|hello|hey|heyy+|howdy|hiya|sup|what's\s+up|help)(\s+there|\s+everyone)?[\s.!?,]*$|^good\s+(morning|afternoon|evening|day)[\s.!?,]*$/i;
const GRATITUDE_REGEX = /^(thanks|thank\s+you|thx|ty)(\s+(so|very)?\s*much|\s+a\s+lot)?[\s.!?,]*$|^(much\s+appreciated|appreciate\s+it|cheers)[\s.!?,]*$/i;
const HUMAN_HANDOFF_REGEX = /\b(talk\s+to\s+(an?\s+)?(human|person|agent|representative|manager|operator)|speak\s+(to|with)\s+(an?\s+)?(human|person|agent|representative|manager)|(human|person|agent|representative|operator)\s+please|real\s+person|customer\s+service\s+(representative|agent))\b/i;
const SIMPLE_CONFIRMATION_REGEX = /^(yes|yeah|yep|sure|ok|okay|go\s+ahead|please\s+do|confirm|proceed)[\s.!?,]*$/i;
const PHONE_NUMBER_REGEX = /^(\+?\d{1,4}[-.\s]?)?(\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Sinhala (සිංහල) and Singlish equivalents. `END` allows trailing punctuation/emoji-free endings.
const END = '[\\s.!?,]*$';
const SI_GREETING_REGEX = new RegExp(
  `^(ආයුබෝවන්|හලෝ|හෙලෝ|හායි|හේයි|කොහොමද|සු[භබ]\\s*(උදෑසනක්|දවසක්|සන්ධ්‍යාවක්|රාත්‍රියක්))(\\s*(ඔයාලට|ඔබට|ඔබ සැමට))?${END}` +
    `|^(ayubowan|ayubovan|kohomada|kohomeda|kohomda)${END}`,
  'iu',
);
const SI_GRATITUDE_REGEX = new RegExp(
  `^((බොහොම|ගොඩක්|ගොඩාක්)\\s*)?(ස්ත[ූු]තියි|ස්ත[ූු]තී)(\\s*(බොහොම|ගොඩක්|ගොඩාක්))?${END}` +
    `|^((bohoma|godak|godak)\\s*)?(i?sthuthi(yi)?|istuti|stuthi|thanks)(\\s*(bohoma|godak|godaak))?${END}`,
  'iu',
);
const SI_HUMAN_HANDOFF_REGEX =
  /(මනුස්සයෙක්|මිනිහෙක්|කෙනෙක්|නිලධාරියෙක්|කළමනාකරු|මැනේජර්|staff\s*කෙනෙක්|manager)\s*(එක්ක|සමඟ|සමග|ට|වෙත)\s*(කතා|කථා)|\b(manussayek|minihek|kenek|ekkenek|manager|staff\s*kenek)\s*(ekka|ta|ekkata)\s*(katha|kata)\b/iu;
const SI_CONFIRMATION_REGEX = new RegExp(
  `^(ඔව්|ඔව්\\s*හරි|හරි|හරි\\s*හරි|එල|එළ|හා|කමක්\\s*නෑ|ඔව්\\s*කරන්න)${END}` +
    `|^(ow|ov|ow\\s*hari|hari|harii|hari\\s*hari|ela|elaa|ha|kamak\\s*na|kamak\\s*ne|ow\\s*karanna)${END}`,
  'iu',
);
const SI_MORE_REGEX = new RegExp(`^(තව|තව\\s*මොනවද|තව\\s*විස්තර)${END}|^(thawa|tawa|thawa\\s*mokada|thawa\\s*monawada|thawa\\s*wisthara)${END}`, 'iu');

export function fastPathRoute(
  message: string,
  previousAgent?: AgentType | null,
): RouteResult | null {
  const trimmed = message.trim();
  if (!trimmed) {
    return { intent: 'support', agent: 'support_agent', confidence: 1.0 };
  }

  // 1. Explicit human handoff request -> route to human_handoff with zero LLM tokens
  if (HUMAN_HANDOFF_REGEX.test(trimmed) || SI_HUMAN_HANDOFF_REGEX.test(trimmed)) {
    return { intent: 'human_handoff', agent: 'human_handoff', confidence: 1.0 };
  }

  // 2. Greetings and pleasantries -> route to support_agent with zero LLM tokens
  if (GREETING_REGEX.test(trimmed) || SI_GREETING_REGEX.test(trimmed)) {
    return { intent: 'support', agent: 'support_agent', confidence: 1.0 };
  }

  // 3. Simple gratitude -> route to support_agent with zero LLM tokens
  if (GRATITUDE_REGEX.test(trimmed) || SI_GRATITUDE_REGEX.test(trimmed)) {
    return { intent: 'support', agent: 'support_agent', confidence: 1.0 };
  }

  // 4. In-flight task continuation: if previous agent was ACTION, and user sends
  // a bare confirmation ("yes", "ok"), phone number, or email address,
  // route directly back to action_agent without wasting an LLM call.
  if (previousAgent === 'ACTION') {
    if (
      SIMPLE_CONFIRMATION_REGEX.test(trimmed) ||
      SI_CONFIRMATION_REGEX.test(trimmed) ||
      PHONE_NUMBER_REGEX.test(trimmed) ||
      EMAIL_REGEX.test(trimmed)
    ) {
      return { intent: 'action', agent: 'action_agent', confidence: 1.0 };
    }
  }

  // 5. In-flight task continuation for KNOWLEDGE (e.g. "tell me more", "what else")
  if (previousAgent === 'KNOWLEDGE') {
    if (/^(more|tell\s+me\s+more|what\s+else|and\?)[\s.!?,]*$/i.test(trimmed) || SI_MORE_REGEX.test(trimmed)) {
      return { intent: 'knowledge', agent: 'knowledge_agent', confidence: 1.0 };
    }
  }

  return null;
}
