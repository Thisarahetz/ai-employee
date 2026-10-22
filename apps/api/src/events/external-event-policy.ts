import { EVENT_TYPES } from './event-types.const';

/**
 * Which event names an external system may push through its webhook.
 * Internal names (conversations, messages, handoffs, AI actions, sagas …)
 * are reserved: accepting them would let a webhook impersonate the platform
 * and fire internal handlers.
 */
const RESERVED_PREFIXES = ['message.', 'conversation.', 'human_handoff.', 'action.', 'integration.', 'saga.', 'invariant.', 'ai_', 'ai.', 'system.', 'platform.'];

const NAME = /^[a-z][a-z0-9_]{1,40}(\.[a-z][a-z0-9_]{1,40}){1,3}$/;

export function externalEventProblem(type: unknown): string | null {
  if (typeof type !== 'string' || !NAME.test(type)) {
    return 'event must look like "booking.created" (lowercase, dot-separated, 2–4 parts)';
  }
  if (RESERVED_PREFIXES.some((p) => type.startsWith(p))) return `"${type}" is a reserved internal event name`;
  return null;
}

/** Events an automation rule can trigger on: business events + selected platform events. */
export const RULE_TRIGGER_EVENTS: string[] = [
  EVENT_TYPES.CUSTOMER_CREATED,
  EVENT_TYPES.CONVERSATION_CREATED,
  EVENT_TYPES.CONVERSATION_CLOSED,
  EVENT_TYPES.MESSAGE_RECEIVED,
  EVENT_TYPES.APPOINTMENT_CREATED,
  EVENT_TYPES.APPOINTMENT_COMPLETED,
  EVENT_TYPES.APPOINTMENT_CANCELLED,
  EVENT_TYPES.LEAD_CREATED,
  EVENT_TYPES.HUMAN_HANDOFF_REQUESTED,
  EVENT_TYPES.ACTION_EXECUTED,
];

/** A rule may also listen to any valid external event name (e.g. "order.refunded"). */
export function isRuleTriggerAllowed(type: string): boolean {
  return RULE_TRIGGER_EVENTS.includes(type) || externalEventProblem(type) === null;
}
