import type { AgentType } from '@prisma/client';

export type NluAgent = 'support_agent' | 'knowledge_agent' | 'action_agent';
export type TemplateKind = 'greeting' | 'thanks' | 'goodbye';

export interface RasaParse {
  intent: string;
  confidence: number;
  /** Confidence of the runner-up intent (0 when there is none). */
  runnerUp: number;
  entities: { entity: string; value: string }[];
}

/** Why a message was not handled by Rasa. Stored with the reply and counted. */
export type FallbackReason =
  | 'disabled'
  | 'rasa_unavailable'
  | 'unsupported_intent'
  | 'low_confidence'
  | 'medium_confidence'
  | 'ambiguous'
  | 'sensitive_intent'
  | 'context_required'
  | 'long_message';

export type NluDecision =
  | {
      path: 'rasa';
      intent: string;
      confidence: number;
      /** Which agent should take the turn (omitted for fixed-reply intents). */
      agent?: NluAgent;
      template?: TemplateKind;
      /** Deterministic English search words for the knowledge base. */
      searchQuery?: string;
      entities: RasaParse['entities'];
    }
  | {
      path: 'llm';
      reason: FallbackReason;
      intent?: string;
      confidence?: number;
    };

export interface NluContext {
  /** The agent that handled the previous turn, for "yes"/"no" continuations. */
  previousAgent?: AgentType | null;
  /** The business's own switch (Settings). Defaults to on. */
  enabled?: boolean;
}

/** What is stored on the reply message (metadata.nlu). No message text. */
export interface NluTrace {
  path: 'rasa' | 'llm';
  intent?: string;
  confidence?: number;
  reason?: FallbackReason;
  ms?: number;
}
