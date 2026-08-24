/**
 * TypeScript types mirroring the Prisma models relevant to the admin UI.
 *
 * Field names and enum values are kept IDENTICAL to `prisma/schema.prisma` so
 * that wiring this UI to the real API responses is a mechanical exercise —
 * only `src/lib/api-client.ts` and the hooks in `src/lib/hooks/*` should ever
 * need to change once the backend is live.
 *
 * Relations are modeled as optional fields (`customer?`, `channel?`, ...)
 * since different endpoints may or may not include them nested.
 */

// ─────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────

export type TenantStatus = "ACTIVE" | "SUSPENDED" | "TRIAL";

export type BusinessType =
  | "SALON"
  | "HOTEL"
  | "CLINIC"
  | "ECOMMERCE"
  | "CRM"
  | "VEHICLE_SERVICE"
  | "ERP"
  | "CUSTOM";

export type UserStatus = "ACTIVE" | "INVITED" | "DISABLED";

export type ConversationStatus =
  | "OPEN"
  | "AI_HANDLING"
  | "HUMAN_HANDLING"
  | "CLOSED";

export type AgentType = "ROUTER" | "SUPPORT" | "KNOWLEDGE" | "ACTION" | "HUMAN";

/** AgentType values that are user-configurable AI agents (excludes HUMAN). */
export const CONFIGURABLE_AGENT_TYPES: Exclude<AgentType, "HUMAN">[] = [
  "ROUTER",
  "SUPPORT",
  "KNOWLEDGE",
  "ACTION",
];

export type MessageSender = "CUSTOMER" | "AI" | "HUMAN_AGENT" | "SYSTEM";

export type MessageContentType =
  | "TEXT"
  | "IMAGE"
  | "FILE"
  | "AUDIO"
  | "LOCATION"
  | "SYSTEM_EVENT";

export type DocumentSourceType = "PDF" | "DOCX" | "TEXT" | "FAQ" | "URL";

export type DocumentStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED";

export type IntegrationType = "STANDARD_API" | "REST_API" | "WEBHOOK" | "N8N";

export type IntegrationStatus = "CONNECTED" | "DISCONNECTED" | "ERROR";

export type CredentialType =
  | "API_KEY"
  | "OAUTH2"
  | "BASIC_AUTH"
  | "BEARER_TOKEN";

export type ChannelType =
  | "WHATSAPP"
  | "WEBSITE_CHAT"
  | "EMAIL"
  | "FACEBOOK_MESSENGER"
  | "INSTAGRAM"
  | "TELEGRAM"
  | "SMS"
  | "VOICE";

export type ChannelStatus = "ACTIVE" | "INACTIVE";

export type AiProviderName = "OPENAI" | "ANTHROPIC";

export type WorkflowExecutionStatus =
  | "PENDING"
  | "RUNNING"
  | "SUCCESS"
  | "FAILED";

export type HandoffReason =
  | "CUSTOMER_REQUEST"
  | "LOW_CONFIDENCE"
  | "UNSUPPORTED_REQUEST"
  | "SENSITIVE_REQUEST"
  | "REPEATED_FAILURE";

export type HandoffStatus = "PENDING" | "ACTIVE" | "RESOLVED";

/** A tenant's fixed roles — see docs/architecture.md's RBAC section. */
export type TenantRole = "OWNER" | "ADMIN" | "MANAGER" | "EMPLOYEE";

export type MembershipStatus = "ACTIVE" | "INVITED" | "DISABLED";

/** Platform-level access, unrelated to any tenant. */
export type PlatformRole = "NONE" | "SUPER_ADMIN";

// ─────────────────────────────────────────────────────────────────────────
// Tenancy / auth
//
// User is a global identity (one row per person) — their relationship to any
// given tenant (role, status) lives in TenantMembership, so one person can
// belong to multiple tenants. Platform-level access (platformRole) is
// separate again, unrelated to any tenant role. See docs/architecture.md.
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

/** GET /admin/tenants — platform-admin-only, cross-tenant. */
export interface AdminTenant extends Tenant {
  userCount: number;
  conversationCount: number;
  integrationCount: number;
}

/** GET /admin/tenants/:id/users, GET /users — a membership joined with its User. */
export interface TenantMembership {
  id: string;
  tenantId: string;
  role: TenantRole;
  status: MembershipStatus;
  createdAt: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    status: UserStatus;
    lastLoginAt?: string | null;
    createdAt: string;
  };
}

/** GET /admin/users — platform-admin-only, every global identity. */
export interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  platformRole: PlatformRole;
  lastLoginAt?: string | null;
  createdAt: string;
  membershipCount: number;
}

/** POST /admin/tenants — creating a tenant on someone's behalf. */
export interface CreateTenantInput {
  tenantName: string;
  tenantSlug?: string;
  ownerEmail: string;
  ownerFirstName: string;
  ownerLastName: string;
  /** Omit to have the server generate one. */
  ownerPassword?: string;
}

export interface CreateTenantResult {
  tenant: Tenant;
  owner: { id: string; email: string };
  createdNewUser: boolean;
  /** Only present when a brand-new identity was created and no password was given — shown once. */
  temporaryPassword?: string;
}

/** POST /users/invite — adding a member to the current tenant. */
export interface InviteMemberInput {
  email: string;
  firstName: string;
  lastName: string;
  role: Exclude<TenantRole, "OWNER">;
}

export interface InviteMemberResult {
  membership: TenantMembership;
  /** Only present when the invitee didn't already have an account — shown once. */
  temporaryPassword?: string;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
  platformRole: PlatformRole;
}

/**
 * The user object returned alongside auth tokens, plus every tenant this
 * account belongs to (for the tenant switcher) and which one the current
 * session is scoped to.
 */
export interface AuthUser extends User {}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  activeTenantId: string | null;
  memberships: { tenantId: string; role: TenantRole; status: MembershipStatus; tenant: Tenant }[];
}

// ─────────────────────────────────────────────────────────────────────────
// Customers
// ─────────────────────────────────────────────────────────────────────────

export interface Customer {
  id: string;
  tenantId: string;
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
  customer?: Customer;
  channelId: string;
  channel?: Channel;
  status: ConversationStatus;
  currentAgent?: AgentType | null;
  assignedUserId?: string | null;
  assignedUser?: User | null;
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
  documents?: Document[];
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
  config: Record<string, unknown>;
  status: IntegrationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationAction {
  id: string;
  tenantId: string;
  integrationId: string;
  name: string;
  description: string;
  parameters: Record<string, unknown>;
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
  configuration?: AiConfiguration | null;
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

// ─────────────────────────────────────────────────────────────────────────
// Workflows (n8n)
// ─────────────────────────────────────────────────────────────────────────

export interface Workflow {
  id: string;
  tenantId: string;
  businessId?: string | null;
  name: string;
  n8nWorkflowId: string;
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
  conversation?: Conversation;
  reason: HandoffReason;
  status: HandoffStatus;
  assignedUserId?: string | null;
  notes?: string | null;
  requestedAt: string;
  resolvedAt?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Notifications
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

// ─────────────────────────────────────────────────────────────────────────
// Generic paginated envelope used by list endpoints (see api-client.ts)
// ─────────────────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
}
