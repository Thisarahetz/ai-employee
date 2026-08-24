/**
 * Hand-maintained TypeScript mirror of `prisma/schema.prisma`. This is NOT generated —
 * it is kept in sync by hand and MUST be reviewed/updated whenever the Prisma schema
 * changes. Its purpose is to give non-Prisma-aware consumers (`apps/web`,
 * `packages/integration-sdk`, `packages/channel-sdk`, future services) a dependency-free
 * TypeScript view of the data model without pulling in `@prisma/client`.
 *
 * Conventions used below (read once, applies to every model):
 * - `id` fields are `string` (Prisma `cuid()`).
 * - `DateTime` fields are `string` (ISO 8601), matching how they serialize over JSON
 *   HTTP responses — consumers that need a `Date` should `new Date(value)`.
 * - `Decimal` fields (only `AiUsageLog.estimatedCostUsd`) are `string`, matching how
 *   Prisma's `Decimal` type serializes to JSON (a numeric string, to avoid float
 *   precision loss) — parse with a decimal library or `Number()` as needed.
 * - `Json` fields default to `Record<string, unknown>` unless a more specific shape is
 *   known and documented inline (e.g. `IntegrationAction.parameters`).
 * - Relation *objects* (e.g. `Tenant.businesses: Business[]`) are intentionally
 *   OMITTED from these base entity types — only scalar columns and foreign-key id
 *   columns are included. API responses that need nested relations should compose
 *   `Foo & { bar: Bar[] }` DTOs on top of these base types rather than this file trying
 *   to model every possible `include`. This keeps the type graph flat and avoids
 *   circular type definitions.
 * - Enums are modeled as `const` objects + a derived union type (the same pattern
 *   modern Prisma Client itself generates), e.g. `TenantStatus.ACTIVE === 'ACTIVE'`, so
 *   values compare equal to `@prisma/client`'s own enum values without depending on it.
 */

import type { ActionParameterSchema } from './integration-contract';

// ─────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────

export const TenantStatus = { ACTIVE: 'ACTIVE', SUSPENDED: 'SUSPENDED', TRIAL: 'TRIAL' } as const;
export type TenantStatus = (typeof TenantStatus)[keyof typeof TenantStatus];

export const BusinessType = {
  SALON: 'SALON',
  HOTEL: 'HOTEL',
  CLINIC: 'CLINIC',
  ECOMMERCE: 'ECOMMERCE',
  CRM: 'CRM',
  VEHICLE_SERVICE: 'VEHICLE_SERVICE',
  ERP: 'ERP',
  CUSTOM: 'CUSTOM',
} as const;
export type BusinessType = (typeof BusinessType)[keyof typeof BusinessType];

export const UserStatus = { ACTIVE: 'ACTIVE', INVITED: 'INVITED', DISABLED: 'DISABLED' } as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const ConversationStatus = {
  OPEN: 'OPEN',
  AI_HANDLING: 'AI_HANDLING',
  HUMAN_HANDLING: 'HUMAN_HANDLING',
  CLOSED: 'CLOSED',
} as const;
export type ConversationStatus = (typeof ConversationStatus)[keyof typeof ConversationStatus];

export const AgentType = {
  ROUTER: 'ROUTER',
  SUPPORT: 'SUPPORT',
  KNOWLEDGE: 'KNOWLEDGE',
  ACTION: 'ACTION',
  HUMAN: 'HUMAN',
} as const;
export type AgentType = (typeof AgentType)[keyof typeof AgentType];

export const MessageSender = { CUSTOMER: 'CUSTOMER', AI: 'AI', HUMAN_AGENT: 'HUMAN_AGENT', SYSTEM: 'SYSTEM' } as const;
export type MessageSender = (typeof MessageSender)[keyof typeof MessageSender];

export const MessageContentType = {
  TEXT: 'TEXT',
  IMAGE: 'IMAGE',
  FILE: 'FILE',
  AUDIO: 'AUDIO',
  LOCATION: 'LOCATION',
  SYSTEM_EVENT: 'SYSTEM_EVENT',
} as const;
export type MessageContentType = (typeof MessageContentType)[keyof typeof MessageContentType];

export const DocumentSourceType = { PDF: 'PDF', DOCX: 'DOCX', TEXT: 'TEXT', FAQ: 'FAQ', URL: 'URL' } as const;
export type DocumentSourceType = (typeof DocumentSourceType)[keyof typeof DocumentSourceType];

export const DocumentStatus = { PENDING: 'PENDING', PROCESSING: 'PROCESSING', READY: 'READY', FAILED: 'FAILED' } as const;
export type DocumentStatus = (typeof DocumentStatus)[keyof typeof DocumentStatus];

export const IntegrationType = { STANDARD_API: 'STANDARD_API', REST_API: 'REST_API', WEBHOOK: 'WEBHOOK', N8N: 'N8N' } as const;
export type IntegrationType = (typeof IntegrationType)[keyof typeof IntegrationType];

export const IntegrationStatus = { CONNECTED: 'CONNECTED', DISCONNECTED: 'DISCONNECTED', ERROR: 'ERROR' } as const;
export type IntegrationStatus = (typeof IntegrationStatus)[keyof typeof IntegrationStatus];

export const CredentialType = {
  API_KEY: 'API_KEY',
  OAUTH2: 'OAUTH2',
  BASIC_AUTH: 'BASIC_AUTH',
  BEARER_TOKEN: 'BEARER_TOKEN',
} as const;
export type CredentialType = (typeof CredentialType)[keyof typeof CredentialType];

export const ChannelType = {
  WHATSAPP: 'WHATSAPP',
  WEBSITE_CHAT: 'WEBSITE_CHAT',
  EMAIL: 'EMAIL',
  FACEBOOK_MESSENGER: 'FACEBOOK_MESSENGER',
  INSTAGRAM: 'INSTAGRAM',
  TELEGRAM: 'TELEGRAM',
  SMS: 'SMS',
  VOICE: 'VOICE',
} as const;
export type ChannelType = (typeof ChannelType)[keyof typeof ChannelType];

export const ChannelStatus = { ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE' } as const;
export type ChannelStatus = (typeof ChannelStatus)[keyof typeof ChannelStatus];

export const AiProviderName = { OPENAI: 'OPENAI', ANTHROPIC: 'ANTHROPIC' } as const;
export type AiProviderName = (typeof AiProviderName)[keyof typeof AiProviderName];

export const WorkflowExecutionStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const;
export type WorkflowExecutionStatus = (typeof WorkflowExecutionStatus)[keyof typeof WorkflowExecutionStatus];

export const HandoffReason = {
  CUSTOMER_REQUEST: 'CUSTOMER_REQUEST',
  LOW_CONFIDENCE: 'LOW_CONFIDENCE',
  UNSUPPORTED_REQUEST: 'UNSUPPORTED_REQUEST',
  SENSITIVE_REQUEST: 'SENSITIVE_REQUEST',
  REPEATED_FAILURE: 'REPEATED_FAILURE',
} as const;
export type HandoffReason = (typeof HandoffReason)[keyof typeof HandoffReason];

export const HandoffStatus = { PENDING: 'PENDING', ACTIVE: 'ACTIVE', RESOLVED: 'RESOLVED' } as const;
export type HandoffStatus = (typeof HandoffStatus)[keyof typeof HandoffStatus];

// ─────────────────────────────────────────────────────────────────────────
// Tenancy
// ─────────────────────────────────────────────────────────────────────────

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  plan: string;
  createdAt: string;
  updatedAt: string;
}

export interface Business {
  id: string;
  tenantId: string;
  name: string;
  type: BusinessType;
  timezone: string;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Users, roles, RBAC
// ─────────────────────────────────────────────────────────────────────────

export interface Role {
  id: string;
  tenantId: string;
  name: string;
  permissions: string[];
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * `passwordHash` and `refreshTokenHash` exist on the underlying `users` table (see
 * `prisma/schema.prisma`) and are included here for 1:1 fidelity with the schema, but
 * API response DTOs (owned by `apps/api`) must never serialize them to any client —
 * treat this as the DB-shaped type, not the API-response-shaped type.
 */
export interface User {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  roleId: string;
  status: UserStatus;
  refreshTokenHash?: string | null;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Customers
// ─────────────────────────────────────────────────────────────────────────

export interface Customer {
  id: string;
  tenantId: string;
  /** ID of this customer in the connected external business system, if known. */
  externalId?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Conversations & messages
// ─────────────────────────────────────────────────────────────────────────

export interface Conversation {
  id: string;
  tenantId: string;
  businessId?: string | null;
  customerId: string;
  channelId: string;
  status: ConversationStatus;
  currentAgent?: AgentType | null;
  assignedUserId?: string | null;
  lastMessageAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  tenantId: string;
  conversationId: string;
  sender: MessageSender;
  agentType?: AgentType | null;
  content: string;
  contentType: MessageContentType;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/** Rolling summary of older messages so full history is never resent to the AI. */
export interface ConversationSummary {
  id: string;
  tenantId: string;
  conversationId: string;
  summary: string;
  /** Messages up to (and including) this timestamp are covered by `summary`. */
  coveredUntil: string;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Knowledge base / RAG
// ─────────────────────────────────────────────────────────────────────────

export interface KnowledgeBase {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Document {
  id: string;
  tenantId: string;
  knowledgeBaseId: string;
  title: string;
  sourceType: DocumentSourceType;
  fileUrl?: string | null;
  status: DocumentStatus;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * `embedding` is `Unsupported("vector(1536)")` in Prisma (see
 * `docs/database-schema.md` for why) and is read/written via raw SQL, not the Prisma
 * query builder. It is typed here as a plain `number[]` and marked optional/omittable:
 * most API responses should NOT include the raw vector (it's large and useless to a
 * UI), so treat its presence as opt-in for debug/admin endpoints only.
 */
export interface DocumentChunk {
  id: string;
  tenantId: string;
  documentId: string;
  knowledgeBaseId: string;
  content: string;
  embedding?: number[];
  chunkIndex: number;
  tokenCount: number;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Integrations
// ─────────────────────────────────────────────────────────────────────────

export interface Integration {
  id: string;
  tenantId: string;
  businessId?: string | null;
  name: string;
  type: IntegrationType;
  baseUrl?: string | null;
  /** REST_API type: endpoint/header/auth/request-response mapping config. */
  config: Record<string, unknown>;
  status: IntegrationStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * `encryptedPayload` (the AES-encrypted secret blob) is deliberately OMITTED from this
 * type. Unlike `User`, which mirrors the schema 1:1 and relies on API DTOs to redact
 * sensitive fields, `IntegrationCredential` and `ChannelCredential` below drop the
 * secret at the type level: this package is imported directly by the frontend and by
 * SDKs, and an encrypted secret blob has no legitimate reason to ever be typed as
 * "data the frontend might receive" — even encrypted, it should never leave the API
 * process. If a future admin/debug use case genuinely needs it, model that as an
 * explicit, separately-named type (e.g. `IntegrationCredentialWithSecret`) rather than
 * widening this one.
 */
export interface IntegrationCredential {
  id: string;
  tenantId: string;
  integrationId: string;
  type: CredentialType;
  createdAt: string;
  updatedAt: string;
}

/**
 * Actions discovered from `GET /ai/actions` on the external system, or registered
 * directly via the Integration SDK's `registerAction()`. `parameters` matches the
 * Integration API Contract's `ActionDefinitionDto['parameters']` shape exactly — see
 * `./integration-contract.ts`.
 */
export interface IntegrationAction {
  id: string;
  tenantId: string;
  integrationId: string;
  name: string;
  description: string;
  parameters: Record<string, ActionParameterSchema>;
  isEnabled: boolean;
  lastDiscoveredAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Channels
// ─────────────────────────────────────────────────────────────────────────

export interface Channel {
  id: string;
  tenantId: string;
  businessId?: string | null;
  type: ChannelType;
  name: string;
  status: ChannelStatus;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** See the `IntegrationCredential` doc comment above — same reasoning applies here. */
export interface ChannelCredential {
  id: string;
  tenantId: string;
  channelId: string;
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────
// AI agents & configuration
// ─────────────────────────────────────────────────────────────────────────

export interface AiAgent {
  id: string;
  tenantId: string;
  type: AgentType;
  name: string;
  systemPrompt: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AiConfiguration {
  id: string;
  tenantId: string;
  aiAgentId: string;
  provider: AiProviderName;
  model: string;
  temperature: number;
  maxTokens: number;
  extraParams: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Per-call token/cost tracking — the core observability signal for token optimization. */
export interface AiUsageLog {
  id: string;
  tenantId: string;
  conversationId?: string | null;
  messageId?: string | null;
  agentType: AgentType;
  provider: AiProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** `Decimal(10,6)` — serializes as a numeric string, see file header. */
  estimatedCostUsd: string;
  executionTimeMs: number;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────
// n8n workflows
// ─────────────────────────────────────────────────────────────────────────

export interface Workflow {
  id: string;
  tenantId: string;
  businessId?: string | null;
  name: string;
  n8nWorkflowId: string;
  /** Event type (see `EVENT_TYPES` in `@ai-employee/shared`) that triggers this workflow. */
  triggerEventType: string;
  isEnabled: boolean;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowExecution {
  id: string;
  tenantId: string;
  workflowId: string;
  eventId?: string | null;
  status: WorkflowExecutionStatus;
  n8nExecutionId?: string | null;
  input: Record<string, unknown>;
  output?: Record<string, unknown> | null;
  errorMessage?: string | null;
  startedAt: string;
  finishedAt?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Human handoff
// ─────────────────────────────────────────────────────────────────────────

export interface HumanHandoff {
  id: string;
  tenantId: string;
  conversationId: string;
  reason: HandoffReason;
  status: HandoffStatus;
  assignedUserId?: string | null;
  notes?: string | null;
  requestedAt: string;
  resolvedAt?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Notifications, events, audit log
// ─────────────────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  tenantId: string;
  userId?: string | null;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/**
 * Internal event bus log entry — every emitted event (`message.received`,
 * `action.executed`, ...) is persisted and can fan out to n8n workflows / webhooks /
 * BullMQ jobs. `type` is a plain `string` here (not the `EventType` union from
 * `@ai-employee/shared`) because the DB column itself is unconstrained `String` in
 * Prisma; validate against `EVENT_TYPE_VALUES` at the boundary where events are created.
 */
export interface Event {
  id: string;
  tenantId: string;
  type: string;
  payload: Record<string, unknown>;
  sourceService?: string | null;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  tenantId: string;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  changes: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
}
