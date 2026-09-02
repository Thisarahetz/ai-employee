/**
 * Canonical internal event-bus type names. Every emitted event is persisted
 * to the `Event` table (see `EventService.emit`) and fanned out via
 * `EventEmitter2`, so other modules can `@OnEvent(EVENT_TYPES.X)` listen,
 * and n8n workflows can be triggered off `Workflow.triggerEventType`.
 */
export const EVENT_TYPES = {
  MESSAGE_RECEIVED: 'message.received',
  CONVERSATION_CREATED: 'conversation.created',
  CONVERSATION_CLOSED: 'conversation.closed',
  CUSTOMER_CREATED: 'customer.created',
  ACTION_EXECUTED: 'action.executed',
  APPOINTMENT_CREATED: 'appointment.created',
  APPOINTMENT_COMPLETED: 'appointment.completed',
  APPOINTMENT_CANCELLED: 'appointment.cancelled',
  LEAD_CREATED: 'lead.created',
  HUMAN_HANDOFF_REQUESTED: 'human_handoff.requested',
  HUMAN_HANDOFF_COMPLETED: 'human_handoff.completed',
  INTEGRATION_CONNECTED: 'integration.connected',
  INTEGRATION_KNOWLEDGE_SYNCED: 'integration.knowledge_synced',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

export interface MessageReceivedPayload {
  tenantId: string;
  businessId?: string;
  conversationId: string;
  customerId: string;
  channelId: string;
  messageId: string;
  content: string;
  contentType: string;
}

export interface ConversationCreatedPayload {
  tenantId: string;
  businessId?: string;
  conversationId: string;
  customerId: string;
  channelId: string;
}

export interface ConversationClosedPayload {
  tenantId: string;
  conversationId: string;
  closedBy?: string;
}

export interface CustomerCreatedPayload {
  tenantId: string;
  customerId: string;
  externalId?: string;
  name?: string;
}

export interface ActionExecutedPayload {
  tenantId: string;
  conversationId?: string;
  integrationId: string;
  actionName: string;
  parameters: Record<string, unknown>;
  result?: Record<string, unknown>;
  success: boolean;
}

export interface HumanHandoffRequestedPayload {
  tenantId: string;
  conversationId: string;
  handoffId: string;
  reason: string;
}

export interface HumanHandoffCompletedPayload {
  tenantId: string;
  conversationId: string;
  handoffId: string;
  resolvedBy?: string;
}

export interface IntegrationConnectedPayload {
  tenantId: string;
  integrationId: string;
  integrationType: string;
}

export interface IntegrationKnowledgeSyncedPayload {
  tenantId: string;
  integrationId: string;
  knowledgeBaseId: string;
  created: number;
  updated: number;
  removed: number;
  locationsCreated: number;
  locationsUpdated: number;
}
