import type { LanguageTag } from '../../common/language/language';

/** Per-message context the orchestrator hands to each specialist agent. */
export interface AgentTurn {
  /** Language the reply must be written in. */
  language: LanguageTag;
  /** English version of a non-English question, for knowledge-base search. */
  searchQuery?: string;
}

export const DEFAULT_TURN: AgentTurn = { language: 'en' };
