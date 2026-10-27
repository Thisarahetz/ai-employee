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

export type DocumentSourceType = "PDF" | "DOCX" | "TEXT" | "FAQ" | "URL" | "INTEGRATION";

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

export type AiProviderName = "OPENAI" | "ANTHROPIC" | "GEMINI";

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
  /** Customer reply default: "en" | "si". */
  defaultLanguage?: string;
  /** Reply in the language each customer writes in. */
  matchCustomerLanguage?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** GET /admin/tenants — platform-admin-only, cross-tenant. */
export interface AdminTenant extends Tenant {
  userCount: number;
  branchCount?: number;
  aiEmployeeCount?: number;
  conversationCount?: number;
  messageCount?: number;
  businessType?: string;
  owner?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string | null;
  } | null;
  businesses?: Business[];
  aiEmployees?: (AiEmployee & { _count?: { activities: number; approvals: number } })[];
  usage?: {
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  };
}


/**
 * A location / branch under a tenant (the `Business` model). Most tenants have
 * exactly one; a salon with several shops has one per shop. Conversations,
 * channels, integrations and workflows can be tagged with a `businessId`.
 */
export interface Business {
  id: string;
  tenantId: string;
  name: string;
  type: BusinessType;
  timezone: string;
  settings: Record<string, unknown>;
  integrationId?: string | null;
  externalId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessInput {
  name: string;
  type?: BusinessType;
  timezone?: string;
}

/** GET /admin/tenants/:id/users, GET /users — a membership joined with its User. */
export interface TenantMembership {
  id: string;
  tenantId: string;
  role: TenantRole;
  status: MembershipStatus;
  jobTitle?: string | null;
  businessRole?: string | null;
  accessLevel?: string | null;
  permissions?: string[];
  allLocations?: boolean;
  locationIds?: string[];
  locations?: { id: string; name: string }[];
  recentActivity?: {
    id: string;
    action: string;
    changes: Record<string, unknown>;
    createdAt: string;
  }[];
  createdAt: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string | null;
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

/** GET /admin/users/:id — one identity plus every tenant they belong to. */
export interface AdminUserDetail extends AdminUser {
  updatedAt: string;
  memberships: {
    id: string;
    role: TenantRole;
    status: MembershipStatus;
    createdAt: string;
    tenant: { id: string; name: string; slug: string; status: TenantStatus };
  }[];
}

/** PATCH /admin/users/:id — grant/revoke platform access, enable/disable account. */
export interface UpdateUserInput {
  platformRole?: PlatformRole;
  status?: Extract<UserStatus, "ACTIVE" | "DISABLED">;
}

/** GET /admin/audit-log — a cross-tenant admin action. */
export interface PlatformAuditEntry {
  id: string;
  action: string;
  targetType: "tenant" | "user";
  targetId: string;
  changes: Record<string, unknown>;
  ipAddress?: string | null;
  createdAt: string;
  actor: { id: string; email: string; firstName: string; lastName: string };
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
  phone?: string;
  role: Exclude<TenantRole, "OWNER">;
  businessRole?: string;
  jobTitle?: string;
  accessLevel?: string;
  permissions?: string[];
  allLocations?: boolean;
  locationIds?: string[];
}

export interface UpdateMemberInput {
  id: string;
  role?: TenantRole;
  status?: MembershipStatus;
  firstName?: string;
  lastName?: string;
  phone?: string;
  businessRole?: string;
  jobTitle?: string;
  accessLevel?: string;
  permissions?: string[];
  allLocations?: boolean;
  locationIds?: string[];
}

export interface PermissionDefinitionInfo {
  id: string;
  name: string;
  description: string;
}

export interface PermissionCategoryInfo {
  id: string;
  name: string;
  description: string;
  permissions: PermissionDefinitionInfo[];
}

export interface BusinessRoleTemplateInfo {
  key: string;
  name: string;
  baseRole: TenantRole;
  accessLevel: 'FULL' | 'MANAGER' | 'STANDARD' | 'LIMITED' | 'CUSTOM';
  description: string;
  defaultPermissions: string[];
}

export interface RoleTemplatesResponse {
  businessType: string;
  templates: BusinessRoleTemplateInfo[];
  categories: PermissionCategoryInfo[];
  accessLevelPresets: Record<string, string[]>;
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
  business?: Business | null;
  customerId: string;
  customer?: Customer;
  channelId: string;
  channel?: Channel;
  status: ConversationStatus;
  currentAgent?: AgentType | null;
  /** Language the customer writes in: "en" | "si" | "si-Latn" (Singlish). */
  language?: string | null;
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
  _count?: { documents: number };
  /** Set when this KB is auto-managed by an integration's knowledge sync. */
  managedBy?: { integrationId: string; integrationName: string } | null;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  knowledgeBaseId: string;
  content: string;
  chunkIndex: number;
  tokenCount: number;
  createdAt: string;
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
  integrationId?: string | null;
  externalId?: string | null;
  content?: string;
  chunks?: DocumentChunk[];
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
  knowledgeBaseId?: string | null;
  lastKnowledgeSyncAt?: string | null;
  createdAt: string;
  updatedAt: string;
  /** Where the system posts its events (full URL). */
  webhookUrl?: string;
  hasWebhookSecret?: boolean;
  actionsCount?: number;
  lastEventType?: string | null;
  lastEventAt?: string | null;
}

/** Returned once, on create or when a new secret is issued. */
export interface IntegrationWebhookSecret {
  webhookSecret: string;
  webhookUrl: string;
}

export interface IntegrationTestResult {
  ok: boolean;
  actions: number;
  knowledge: { documents: number; locations: number } | null;
  message: string;
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
  /** Present on `GET /channels/:id` — true when at least one credential is stored. */
  hasCredentials?: boolean;
  /** Present on `GET /channels` — setup is complete (ids and keys are in place). */
  connected?: boolean;
  /** Present on `GET /channels` — when a customer last reached us on this channel. */
  lastMessageAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `GET /channels/:id/connection-info` — derived connection details (never secrets). */
export interface ChannelConnectionInfo {
  channelId: string;
  type: ChannelType;
  hasCredentials: boolean;
  webhookUrl: string | null;
  verifyToken: string | null;
  phoneNumberId: string | null;
  widgetUrl: string | null;
  widgetSnippet: string | null;
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
  page?: number;
  pageSize?: number;
}

// ─────────────────────────────────────────────────────────────────────────
// AI Employee Platform — Personas, Tasks, Permissions, Approvals & Activity
// ─────────────────────────────────────────────────────────────────────────

export type AiEmployeeStatus = "ACTIVE" | "PAUSED" | "NEEDS_ATTENTION";
export type ActionLevel = "AUTOMATIC" | "APPROVAL_REQUIRED" | "OWNER_ONLY";
export type EmployeeScope = "ALL_BRANCHES" | "SELECTED_BRANCHES";

export interface EmployeeTask {
  category: "CUSTOMER" | "SALES" | "INVENTORY" | "FINANCE" | "OPERATIONS";
  task: string;
  isEnabled: boolean;
}

/** Computed by the API from real task history. */
export interface EmployeeStats {
  tasksCompleted: number;
  tasksFailed: number;
  tasksActive: number;
  /** null until the employee has finished at least one task. */
  successRate: number | null;
  pendingApprovals: number;
  costUsd30d: number;
  lastActiveAt: string | null;
}

export interface AiEmployee {
  id: string;
  tenantId: string;
  name: string;
  role: string;
  department: string;
  businessFunction: string;
  description: string;
  avatar?: string | null;
  status: AiEmployeeStatus;
  actionLevel: ActionLevel;
  scope: EmployeeScope;
  branchIds: string[];
  responsibilities: string[];
  assignedTasks: EmployeeTask[];
  permissions: Record<string, boolean>;
  systemPrompt?: string;
  connectedTools?: string[];
  stats: EmployeeStats;
  createdAt: string;
  updatedAt: string;
  approvals?: AiEmployeeApproval[];
  activities?: AiEmployeeActivity[];
}

export interface AiEmployeeStatsSummary {
  total: number;
  active: number;
  paused: number;
  needsApproval: number;
  errors: number;
}

export interface AiEmployeeApproval {
  id: string;
  tenantId: string;
  employeeId: string;
  employee?: {
    id: string;
    name: string;
    role: string;
    department: string;
    avatar?: string | null;
  };
  title: string;
  description: string;
  actionType: string;
  actionPayload: Record<string, unknown>;
  status: "PENDING" | "APPROVED" | "REJECTED";
  requestedAt: string;
  reviewedAt?: string | null;
  reviewedByUserId?: string | null;
  reviewNotes?: string | null;
  taskId?: string | null;
  task?: { id: string; title: string; status: string } | null;
}

export interface AiEmployeeActivity {
  id: string;
  tenantId: string;
  employeeId: string;
  employee?: {
    id: string;
    name: string;
    role: string;
    department: string;
    avatar?: string | null;
  };
  action: string;
  category: "CUSTOMER" | "SALES" | "INVENTORY" | "FINANCE" | "OPERATIONS";
  details: string;
  status: "SUCCESS" | "PENDING_APPROVAL" | "REJECTED" | "FAILED";
  branchId?: string | null;
  createdAt: string;
}

export interface BusinessTemplateInfo {
  /** Template key, e.g. "SALON_SPA". */
  id: string;
  /** Database id used by the apply endpoint. */
  templateId?: string;
  owner?: "platform" | "business";
  scheduleCount?: number;
  ruleCount?: number;
  name: string;
  category: string;
  icon: string;
  description: string;
  employeeCount: number;
  employees: {
    key: string;
    name: string;
    role: string;
    department: string;
    description: string;
    actionLevel: ActionLevel;
  }[];
}

export interface PlatformStats {
  tenants: {
    total: number;
    active: number;
    trial: number;
    suspended: number;
    newThisMonth: number;
  };
  aiEmployees: {
    total: number;
    active: number;
    paused: number;
    needsAttention: number;
  };
  users: {
    total: number;
    active: number;
    superAdmins: number;
  };
  conversations: {
    total: number;
    aiHandling: number;
    closed: number;
  };
  usage: {
    totalTokens: number;
    estimatedCostUsd: number;
  };
  recentAudits: PlatformAuditEntry[];
  systemAlerts: string[];
}

export interface AdminAiEmployee {
  id: string;
  tenantId: string;
  name: string;
  role: string;
  department: string;
  businessFunction: string;
  description: string;
  avatar?: string | null;
  status: "ACTIVE" | "PAUSED" | "NEEDS_ATTENTION";
  actionLevel: "AUTOMATIC" | "APPROVAL_REQUIRED" | "OWNER_ONLY";
  scope: string;
  responsibilities: string[];
  assignedTasks: { category: string; task: string; isEnabled: boolean }[];
  permissions: Record<string, boolean>;
  systemPrompt: string;
  stats: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  tenant: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    status: string;
  };
  activityCount: number;
  pendingApprovalsCount: number;
}

export interface AdminBusinessTemplate {
  id: string;
  name: string;
  category: string;
  icon: string;
  description: string;
  suggestedEmployeesCount: number;
  suggestedEmployees: {
    key: string;
    name: string;
    role: string;
    department: string;
    businessFunction: string;
    description: string;
    avatar?: string;
    actionLevel: "AUTOMATIC" | "APPROVAL_REQUIRED" | "OWNER_ONLY";
    responsibilities: string[];
    assignedTasks: { category: string; task: string; isEnabled: boolean }[];
    permissions: Record<string, boolean>;
    systemPrompt: string;
  }[];
  adoptionCount: number;
}

export interface AdminBusinessType {
  id: string;
  name: string;
  /** Categories of the platform templates for this type. */
  categories: string[];
  defaultTemplates: string[];
  templateNames: string[];
  activeCount: number;
}

export interface AdminPlan {
  id: string;
  name: string;
  badge: string;
  description: string;
  priceMonthlyUsd: number;
  limits: {
    maxBranches: number;
    maxAiEmployees: number;
    maxTeamMembers: number;
    messagesPerMonth: number;
    knowledgeDocs: number;
    support: string;
  };
  tenantCount: number;
  /** Reply modes businesses on this plan may pick. */
  allowedReplyModes: ReplyMode[];
}

export interface AdminUsageStats {
  tokens: {
    total: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
    totalInvocations: number;
  };
  volumes: {
    conversations: number;
    messages: number;
  };
  activitiesByCategory: { category: string; count: number }[];
  topTenants: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    status: string;
    conversationsCount: number;
    messagesCount: number;
    aiEmployeesCount: number;
  }[];
}

export interface AdminHealthStatus {
  status: "healthy" | "degraded";
  timestamp: string;
  diagnosticDurationMs: number;
  services: {
    api: {
      status: string;
      uptimeSeconds: number;
      nodeVersion: string;
      memoryHeapUsedMb: number;
      memoryRssMb: number;
    };
    database: {
      status: string;
      latencyMs: number;
      provider: string;
    };
    redis: {
      status: string;
      latencyMs: number;
      queue: Record<string, number> | null;
    };
    aiProviders: {
      openai: { configured: boolean; status: string; isPlatformDefault: boolean; defaultModel: string | null };
      anthropic: { configured: boolean; status: string; isPlatformDefault: boolean; defaultModel: string | null };
      gemini: { configured: boolean; status: string; isPlatformDefault: boolean; defaultModel: string | null };
    };
    channels: {
      activeChannels: number;
      whatsappWebhookSigned: boolean;
      wahaWebhookSigned: boolean;
    };
  };
}

interface EnvSetting<T> {
  value: T;
  env: string;
}

/** Effective platform configuration (from environment variables; read-only). */
export interface AdminPlatformSettings {
  source: "environment";
  ai: { defaultProvider: EnvSetting<string>; defaultModel: EnvSetting<string>; platformKeysAllowed: EnvSetting<boolean> };
  defaultTenantLimits: Record<string, EnvSetting<number | null>>;
  security: Record<string, EnvSetting<string | number | boolean>>;
  workers: Record<string, EnvSetting<number | boolean>>;
  perTenantOverrides: string;
}



// ─── AI Workforce (owner command chat) ──────────────────────────────────

export type AiTaskStatus =
  | "QUEUED"
  | "RUNNING"
  | "WAITING_APPROVAL"
  | "PAUSED"
  | "BLOCKED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type AiTaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export type CommandIntent =
  | "STATUS_QUERY"
  | "TEAM_STATUS"
  | "DAILY_SUMMARY"
  | "TASK_FOLLOWUP"
  | "CONTROL"
  | "REVIEW"
  | "MEETING"
  | "NEW_TASK";

export interface AiTask {
  id: string;
  kind: "TASK" | "REVIEW" | "GROUP";
  title: string;
  status: AiTaskStatus;
  priority: AiTaskPriority;
  progress: number;
  deadline?: string | null;
  employeeId?: string | null;
  employee?: { id: string; name: string; role: string; department: string; avatar?: string | null } | null;
  children?: { id: string; status: AiTaskStatus; progress: number; employee?: { id: string; name: string } | null }[];
  _count?: { approvals: number };
  result?: string | null;
  error?: string | null;
  updatedAt: string;
}

export interface OwnerCommandMessage {
  id: string;
  threadId: string;
  role: "OWNER" | "AI" | "SYSTEM";
  employeeId?: string | null;
  content: string;
  metadata: {
    intent?: CommandIntent;
    taskIds?: string[];
    employeeIds?: string[];
    limitations?: string[];
    kind?: string;
    status?: string;
  };
  createdAt: string;
}

export interface OwnerCommandThread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: OwnerCommandMessage[];
}

export interface SendCommandResponse {
  threadId: string;
  intent: CommandIntent;
  messages: OwnerCommandMessage[];
}

// ── AI workforce: schedules, limits, usage ─────────────────────────────────

export interface AiTaskSchedule {
  id: string;
  employeeId: string;
  employee?: { id: string; name: string; role: string; status: string };
  title: string;
  description: string;
  goal: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  cron: string;
  timezone: string;
  enabled: boolean;
  overlapPolicy: "SKIP" | "QUEUE";
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  consecutiveFailures: number;
  maxConsecutiveFailures: number;
}

export interface AiLimits {
  aiEnabled: boolean;
  monthlyBudgetUsd: number | null;
  dailyBudgetUsd: number | null;
  maxTaskCostUsd: number;
  maxTaskSteps: number;
  maxConcurrentTasks: number;
  maxTasksPerDay: number;
  maxSchedules: number;
}

export interface AiUsageSnapshot {
  limits: AiLimits;
  spentTodayUsd: number;
  spentThisMonthUsd: number;
  tasksCreatedToday: number;
  runningTasks: number;
  activeSchedules: number;
}

// ── Reply engine (saved answers, reply modes) ─────────────────────────────

export type ReplyMode = "AI" | "HYBRID" | "NO_AI";
export type SavedAnswerStatus = "ACTIVE" | "SUGGESTED" | "DISABLED";

export interface SavedAnswer {
  id: string;
  status: SavedAnswerStatus;
  questions: string[];
  answerEn: string;
  answerSi: string;
  answerSiLatn: string;
  askedCount: number;
  useCount: number;
  lastUsedAt: string | null;
  sourceConversationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SavedAnswerInput {
  questions: string[];
  answerEn: string;
  answerSi: string;
  answerSiLatn: string;
  status?: SavedAnswerStatus;
  sourceConversationId?: string;
}

export interface ReplySettings {
  plan: string;
  mode: ReplyMode;
  effectiveMode: ReplyMode;
  allowedModes: ReplyMode[];
  smartRouting: { available: boolean; enabled: boolean };
}

export type SavedAnswerTestResult =
  | { matched: false }
  | {
      matched: true;
      wouldReply: boolean;
      score: number;
      savedAnswerId: string;
      matchedQuestion: string;
      reply: string;
      replyLanguageMissing: boolean;
    };

export interface ReplyStats {
  days: number;
  totalReplies: number;
  aiReplies: number;
  savedAnswerReplies: number;
  quickReplies: number;
  handedToStaff: number;
  answeredWithoutAi: number;
  withoutAiPercent: number;
  aiSpendUsd: number;
  estimatedSavedUsd: number | null;
  openSuggestions: number;
}
