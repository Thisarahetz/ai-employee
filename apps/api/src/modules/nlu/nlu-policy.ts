import { AgentType } from '@prisma/client';
import type { NluConfig } from './nlu.config';
import type { NluAgent, NluContext, NluDecision, RasaParse, TemplateKind } from './nlu.types';

type IntentRoute =
  | { kind: 'template'; template: TemplateKind }
  | { kind: 'agent'; agent: NluAgent; searchQuery?: string; highRisk?: boolean }
  | { kind: 'continuation' }
  | { kind: 'sensitive' };

/**
 * What each intent is allowed to do. Rasa only chooses WHO handles the turn;
 * the agents and tools still check permissions, tenant scope and approvals, so
 * a confident (or wrong) prediction can never run an action by itself.
 */
export const INTENT_ROUTES: Record<string, IntentRoute> = {
  greeting: { kind: 'template', template: 'greeting' },
  thanks: { kind: 'template', template: 'thanks' },
  goodbye: { kind: 'template', template: 'goodbye' },
  // Handing a customer to staff stays with the strict patterns plus the
  // router LLM; a model score alone never starts a handoff.
  request_human: { kind: 'sensitive' },
  affirm: { kind: 'continuation' },
  deny: { kind: 'continuation' },
  // Fixed English search words stand in for the translation call a
  // Sinhala/Singlish question would otherwise need.
  ask_business_hours: { kind: 'agent', agent: 'knowledge_agent', searchQuery: 'business opening hours days time' },
  ask_pricing: { kind: 'agent', agent: 'knowledge_agent', searchQuery: 'price cost fee rates' },
  ask_location: { kind: 'agent', agent: 'knowledge_agent', searchQuery: 'address location contact phone directions' },
  ask_services: { kind: 'agent', agent: 'knowledge_agent', searchQuery: 'services treatments packages menu' },
  book_appointment: { kind: 'agent', agent: 'action_agent' },
  check_availability: { kind: 'agent', agent: 'action_agent' },
  lookup_booking: { kind: 'agent', agent: 'action_agent' },
  cancel_appointment: { kind: 'agent', agent: 'action_agent', highRisk: true },
  reschedule_appointment: { kind: 'agent', agent: 'action_agent', highRisk: true },
};

const UNSUPPORTED = new Set(['out_of_scope', 'nlu_fallback']);

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/**
 * Pure routing decision from a Rasa prediction. Anything not clearly
 * understood, supported and safe goes to the existing LLM router.
 */
export function decide(parse: RasaParse, text: string, ctx: NluContext, cfg: NluConfig): NluDecision {
  const { intent, confidence } = parse;
  const llm = (reason: Extract<NluDecision, { path: 'llm' }>['reason']): NluDecision => ({ path: 'llm', reason, intent, confidence });

  const route = INTENT_ROUTES[intent];
  if (UNSUPPORTED.has(intent) || !route) return llm('unsupported_intent');
  if (confidence < cfg.lowConfidence) return llm('low_confidence');
  const bar = route.kind === 'agent' && route.highRisk ? cfg.highRiskConfidence : cfg.highConfidence;
  if (confidence < bar) return llm('medium_confidence');
  if (confidence - parse.runnerUp < cfg.minMargin) return llm('ambiguous');

  const base = { path: 'rasa' as const, intent, confidence, entities: parse.entities };
  switch (route.kind) {
    case 'sensitive':
      return llm('sensitive_intent');
    case 'template':
      return wordCount(text) <= cfg.templateMaxWords ? { ...base, template: route.template } : llm('long_message');
    case 'continuation': {
      // "yes" / "no" only mean something inside the task that asked.
      if (ctx.previousAgent === AgentType.ACTION) return { ...base, agent: 'action_agent' };
      return llm('context_required');
    }
    case 'agent':
      return { ...base, agent: route.agent, searchQuery: route.searchQuery };
  }
}
