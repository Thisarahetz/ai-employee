/**
 * The internal event-bus event types emitted throughout AI Employee (see the `Event`
 * model in `prisma/schema.prisma`, and `apps/api/src/modules/{conversation,ai-agent,
 * external-action,human-handoff,integration}` for emitters).
 *
 * This list is a **duplicate-but-authoritative** reference. `apps/api` (NestJS) may
 * keep its own internal copy for use with `@nestjs/event-emitter` / BullMQ job names,
 * but every non-NestJS consumer — `packages/integration-sdk`, `packages/channel-sdk`,
 * future services, scripts — should import `EVENT_TYPES` from here rather than reaching
 * into `apps/api`. If you add or rename an event type in the API, mirror the change here
 * in the same PR.
 *
 * Payload shape for these events (as delivered to n8n) is documented in
 * `docs/n8n-architecture.md`.
 */
export const EVENT_TYPES = {
  MESSAGE_RECEIVED: 'message.received',
  CONVERSATION_CREATED: 'conversation.created',
  CONVERSATION_CLOSED: 'conversation.closed',
  CUSTOMER_CREATED: 'customer.created',
  ACTION_EXECUTED: 'action.executed',
  HUMAN_HANDOFF_REQUESTED: 'human_handoff.requested',
  HUMAN_HANDOFF_COMPLETED: 'human_handoff.completed',
  INTEGRATION_CONNECTED: 'integration.connected',
} as const;

/** Union of every known event type string, e.g. `'message.received' | 'conversation.created' | ...`. */
export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

/** All event type values as an array, useful for validation (e.g. `z.enum(EVENT_TYPE_VALUES)`). */
export const EVENT_TYPE_VALUES: EventType[] = Object.values(EVENT_TYPES);
