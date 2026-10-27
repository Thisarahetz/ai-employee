import type { LanguageTag } from '../../common/language/language';

/** Per-message context the orchestrator hands to each specialist agent. */
export interface AgentTurn {
  /** Language the reply must be written in. */
  language: LanguageTag;
  /** English version of a non-English question, for knowledge-base search. */
  searchQuery?: string;
  /** Owner-approved saved answers close to this question: the facts to rely on first. */
  approvedAnswers?: string[];
  /** The reply will be spoken on a phone call, not read. */
  spoken?: boolean;
}

/** Appended to an agent's prompt on a phone call. */
export const SPOKEN_REPLY_INSTRUCTION = [
  'PHONE CALL: your reply is read aloud to the caller by a text-to-speech voice.',
  '- Answer in one to three short, natural sentences. Say only what was asked; offer more if they want it.',
  '- No lists, markdown, emojis, links or symbols. Say prices, dates and times the way a person would say them.',
  '- Ask one question at a time.',
].join('\n');

export const spokenSuffix = (turn: AgentTurn) => (turn.spoken ? `\n\n${SPOKEN_REPLY_INSTRUCTION}` : '');

export const DEFAULT_TURN: AgentTurn = { language: 'en' };
