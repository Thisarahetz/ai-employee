# Database Schema

Narrative walkthrough of [`prisma/schema.prisma`](https://github.com/Thisarahetz/ai-employee/blob/main/prisma/schema.prisma) — the single
source of truth for the data model. If this document and the schema ever disagree, the
schema wins; please fix this doc in the same PR that changes the schema. The
hand-maintained TypeScript mirror of these models lives in
[`packages/types/src/entities.ts`](https://github.com/Thisarahetz/ai-employee/blob/main/packages/types/src/entities.ts).

See also [`docs/architecture.md`](architecture.md) for the system-level picture these
tables serve.

## Conventions used throughout

- **IDs** are `cuid()` strings, not auto-increment integers (collision-resistant across
  services, safe to generate client-side if ever needed).
- **Table names** are `snake_case` via `@@map` (e.g. `model AiUsageLog` → table
  `ai_usage_logs`); model names in TypeScript stay `PascalCase`.
- **Timestamps**: `createdAt DateTime @default(now())`, and `updatedAt DateTime
@updatedAt` where a row is ever mutated (append-only tables like `Message`, `Event`,
  `AuditLog` only have `createdAt`).
- **`Json` columns** default to `"{}"` rather than being nullable, so consumers never
  have to null-check before reading a key out of them.
- **Multi-tenancy**: every tenant-scoped model carries a `tenantId String` column, a
  relation to `Tenant`, and at minimum `@@index([tenantId])` — see the dedicated section
  below.

## Models grouped by domain

### Tenancy — `Tenant`, `Business`

`Tenant` is the top-level SaaS customer (one row per paying customer of AI Employee).
`Business` is a business unit under a tenant — usually exactly one, occasionally several
(e.g. a salon chain with multiple locations, each with its own `timezone` and
`settings` JSON). `Business.type` (`BusinessType`: `SALON | HOTEL | CLINIC | ECOMMERCE |
CRM | VEHICLE_SERVICE | ERP | CUSTOM`) is informational only — it never gates which code
paths run; the whole point of the Integration Layer is that AI Employee's core logic
doesn't branch on business type. `Integration`, `Channel`, `Conversation`, and
`Workflow` all optionally scope to a `businessId` for tenants running multiple
locations under one account.

### Users, tenant membership, RBAC — `User`, `TenantMembership`

`User` is a **global identity**, not tenant-scoped — `email` is unique across the whole
platform, and `id` is what every other model's `userId`/`assignedUserId` points at.
`passwordHash` and `refreshTokenHash` never leave `apps/api`. `platformRole`
(`NONE | SUPER_ADMIN`) is platform-level access, unrelated to any tenant — see
"Platform Administration & Tenant Management" in
[`docs/architecture.md`](architecture.md).

`TenantMembership` (mapped to table `tenant_users`, `@@unique([tenantId, userId])`) is
where a person's relationship to one specific tenant lives: `role`
(`OWNER | ADMIN | MANAGER | EMPLOYEE`, a fixed enum — no per-tenant custom `Role` table)
and `status` (`ACTIVE | INVITED | DISABLED`). One `User` can have many
`TenantMembership` rows — the same person can own one business and be an `EMPLOYEE` on
another. Default permission sets per `TenantRole` live in code, not the schema — see
[`packages/shared/src/constants/permissions.ts`](https://github.com/Thisarahetz/ai-employee/blob/main/packages/shared/src/constants/permissions.ts)
(mirrors `apps/api/src/modules/auth/auth.service.ts`'s `TENANT_ROLE_PERMISSIONS`, the
actual source of truth enforced by `RolesGuard`).

### Customers — `Customer`

The tenant's *end customers* — the people messaging in, not AI Employee users.
`externalId` optionally links a `Customer` row to its record in the connected external
business system (looked up via the Integration Layer rather than assumed to match by
email/phone, which are often absent or unverified on inbound channels). Indexed on
`(tenantId, externalId)` for that lookup path.

### Conversations & messages — `Conversation`, `Message`, `ConversationSummary`

`Conversation` ties a `Customer` to a `Channel` and tracks `status`
(`OPEN | AI_HANDLING | HUMAN_HANDLING | CLOSED`) and `currentAgent` (`AgentType`, see
below). `assignedUserId` is set once a human takes over. `Message` rows are append-only
and belong to a `Conversation`; `sender` (`CUSTOMER | AI | HUMAN_AGENT | SYSTEM`) plus
the optional `agentType` together say who/what produced the message. `contentType`
(`TEXT | IMAGE | FILE | AUDIO | LOCATION | SYSTEM_EVENT`) lets non-text payloads flow
through the same table. `ConversationSummary` holds a rolling condensed summary of
everything up to `coveredUntil`, so the AI context builder can send "summary + messages
after `coveredUntil`" instead of full history — see
[`docs/token-optimization-strategy.md`](token-optimization-strategy.md) (Rule 9).

Indexes: `Conversation` on `(tenantId, status)` and `(tenantId, customerId)` for inbox
and per-customer views; `Message` on `(tenantId, conversationId, createdAt)` for
paginated/ordered history reads, which is also exactly the index a "last N messages"
context-window query needs.

### Knowledge base / RAG — `KnowledgeBase`, `Document`, `DocumentChunk`

`KnowledgeBase` is a named collection of `Document`s. A `Document` has a `sourceType`
(`PDF | DOCX | TEXT | FAQ | URL | INTEGRATION`) and a processing `status`
(`PENDING | PROCESSING | READY | FAILED`, with `errorMessage` on failure). Once
processed, a `Document` is split into `DocumentChunk` rows — bounded pieces small enough
to embed and to cheaply inject into a prompt (`tokenCount` tracked per chunk, `chunkIndex`
preserves order for citation/debugging).

`sourceType = INTEGRATION` marks a `Document` synced from an external system's
`GET /ai/knowledge` feed (see the Integrations section below): `integrationId` points at
the source `Integration` (cascade-deletes with it) and `externalId` is that system's
stable id for the document, so re-syncs upsert on `(integrationId, externalId)` rather
than piling up duplicates. These documents live in a dedicated KnowledgeBase the sync
auto-creates and are overwritten on every sync — operators edit the source system, not
the document.

**Why `embedding` is `Unsupported("vector(1536)")`**: Prisma's schema language has no
native vector/embedding type. The `pgvector` Postgres extension (enabled via
`extensions = [pgvector(map: "vector")]` in the `datasource` block, and via the
`postgresqlExtensions` preview feature) provides a `vector(N)` column type that Prisma
can *declare* (as `Unsupported("vector(1536)")`, `1536` matching
`text-embedding-3-small`-class models — adjust if the embedding provider changes) but
cannot read, write, or filter through its normal query builder — `Unsupported` fields
are excluded from `select`, `create`/`update` data, and `where` entirely. In practice
that means:

- **Writes**: inserting/updating a chunk's embedding is done with `$executeRaw`,
  typically `UPDATE document_chunks SET embedding = $1::vector WHERE id = $2`.
- **Reads / similarity search**: nearest-neighbor queries use `$queryRaw` with
  pgvector's distance operators (`<->` Euclidean, `<=>` cosine, `<#>` inner product),
  e.g. `SELECT id, content, 1 - (embedding <=> $1::vector) AS score FROM document_chunks
WHERE tenant_id = $2 AND knowledge_base_id = $3 ORDER BY embedding <=> $1::vector LIMIT
  $4`. Every such raw query must still filter on `tenant_id` by hand, since it bypasses
  the tenant-scoping Prisma extension described below.

This lives in `packages/ai-core` and/or `apps/api/src/modules/rag` (owned by the AI-core
agent), not in this doc set's ownership, but the *why* belongs here since it's a schema
decision.

### Integrations — `Integration`, `IntegrationCredential`, `IntegrationAction`

`Integration` is one connection to one external business system (`type`:
`STANDARD_API | REST_API | WEBHOOK | N8N`), with a `config` JSON blob holding
endpoint/header/mapping details for `REST_API`-type integrations. `knowledgeBaseId` +
`lastKnowledgeSyncAt` track the dedicated `KnowledgeBase` auto-created on the first
`GET /ai/knowledge` sync (nulled, not cascaded, if that KB is deleted); the same sync's
`locations` array upserts `Business` rows carrying `Business.integrationId` +
`Business.externalId` (`onDelete: SetNull` — a synced Location outlives its integration).
`IntegrationCredential`
holds the auth secret (`type`: `API_KEY | OAUTH2 | BASIC_AUTH | BEARER_TOKEN`) as an
AES-`encryptedPayload` — never stored or returned as plaintext; see
`CREDENTIALS_ENCRYPTION_KEY` in `.env.example`. `IntegrationAction` is a discovered or
manually-registered action (`GET /ai/actions` result, or an Integration SDK
`registerAction()` call) with a JSON-schema-like `parameters` column matching the
Integration API Contract (`ActionDefinitionDto['parameters']` in
[`packages/types/src/integration-contract.ts`](https://github.com/Thisarahetz/ai-employee/blob/main/packages/types/src/integration-contract.ts)),
unique per `(integrationId, name)`. Full contract:
[`docs/integration-api-contract.md`](integration-api-contract.md).

### Channels — `Channel`, `ChannelCredential`

`Channel` is one configured inbound/outbound surface (`type`: `WHATSAPP |
WEBSITE_CHAT | EMAIL | FACEBOOK_MESSENGER | INSTAGRAM | TELEGRAM | SMS | VOICE`) with its
own `config` JSON and encrypted `ChannelCredential` (webhook secrets, provider tokens,
SMTP creds, ...), structurally identical in shape and treatment to
`IntegrationCredential` above.

### AI agents & configuration — `AiAgent`, `AiConfiguration`, `AiUsageLog`

`AiAgent` is one row per `AgentType` per tenant (`@@unique([tenantId, type])`) —
`ROUTER | SUPPORT | KNOWLEDGE | ACTION | HUMAN` — holding that agent's `systemPrompt`
and an `isEnabled` toggle. `AiConfiguration` is its 1:1 companion (`aiAgentId @unique`)
specifying `provider` (`OPENAI | ANTHROPIC`), `model`, `temperature`, `maxTokens`, and an
`extraParams` JSON escape hatch — this is what lets, say, the `ROUTER` agent default to
a cheap/fast model while `ACTION` uses a stronger one, per tenant. `AiUsageLog` is an
append-only per-call record (`inputTokens`, `outputTokens`, `estimatedCostUsd` as
`Decimal(10,6)`, `executionTimeMs`) — the core observability signal behind
[`docs/token-optimization-strategy.md`](token-optimization-strategy.md). See the ER
summary below for how it relates to `Conversation`/`Message`.

### n8n workflows — `Workflow`, `WorkflowExecution`

`Workflow` maps a `triggerEventType` string (one of the values in
`EVENT_TYPES`, see
[`packages/shared/src/constants/event-types.ts`](https://github.com/Thisarahetz/ai-employee/blob/main/packages/shared/src/constants/event-types.ts))
to an `n8nWorkflowId` in the n8n instance. `WorkflowExecution` is one run of that
workflow, optionally linked back to the `Event` that triggered it, tracking
`status` (`PENDING | RUNNING | SUCCESS | FAILED`), `input`/`output` JSON, and timing.
Full flow: [`docs/n8n-architecture.md`](n8n-architecture.md).

### Human handoff — `HumanHandoff`

One row per escalation from an AI agent to a human, `reason` (`HandoffReason`:
`CUSTOMER_REQUEST | LOW_CONFIDENCE | UNSUPPORTED_REQUEST | SENSITIVE_REQUEST |
REPEATED_FAILURE`) and `status` (`HandoffStatus`: `PENDING | ACTIVE | RESOLVED`).
Trigger conditions and the event flow around this table:
[`docs/multi-agent-architecture.md`](multi-agent-architecture.md).

### Notifications, events, audit — `Notification`, `Event`, `AuditLog`

`Notification` is an in-app notification for a `User` (`isRead` flag, free-form `type`
string, `metadata` JSON). `Event` is the append-only internal event bus log — every
`message.received`, `action.executed`, etc. is persisted here with a free-form JSON
`payload`, independent of whether anything ends up consuming it (n8n `Workflow` match,
webhook, BullMQ job). `AuditLog` records `action`/`entityType`/`entityId` + a `changes`
JSON diff for compliance/debugging, with `ipAddress`/`userAgent` captured where
available.

## Multi-tenancy enforcement pattern

Every scoped model above carries `tenantId String` plus a relation to `Tenant` with
`onDelete: Cascade`, and at least `@@index([tenantId])` (many add a composite index for
their dominant query pattern, e.g. `Message` on `(tenantId, conversationId, createdAt)`).
This is necessary but not sufficient on its own — the schema *allows* correct scoping,
it doesn't *enforce* it. Enforcement is an application-layer **convention**, owned by
`apps/api`'s tenant middleware/guards (see
[`docs/architecture.md`](architecture.md#multi-tenancy)):

1. An authenticated request resolves a `TenantContext` (`{ tenantId, userId, role,
   permissions, platformRole }`) from the JWT, via `TenantMiddleware`.
2. Every tenant-scoped service method takes `tenantId` as an explicit parameter and
   includes it in its `where` clause (`{ id, tenantId }`, never a bare `{ id }`) — this
   is hand-written per service, not injected automatically by a Prisma extension or
   middleware, so it's the one thing worth checking in review for any new tenant-scoped
   module.
3. Lookups for a resource whose `tenantId` doesn't match the caller's tenant are written
   to return 404 (not 403), so a cross-tenant ID guess can't even confirm the resource
   exists.

The one deliberate, narrow exception is `apps/api/src/modules/admin` (gated by
`PlatformAdminGuard`, keyed off `User.platformRole`, not any tenant's `TenantContext`)
— see "Platform Administration & Tenant Management" in
[`docs/architecture.md`](architecture.md). Every hand-written `$queryRaw`/`$executeRaw`
against `document_chunks` (the RAG vector-search queries described above) must also
include `tenant_id = $n` explicitly, same as any other tenant-scoped query. This is the single
sharpest edge in the schema from a security standpoint and is worth a code-review
checklist item wherever raw SQL touches a tenant-scoped table.

## ER relationship summary: Conversation ↔ Message ↔ AiUsageLog ↔ Event

This is the core chain behind a single AI-handled turn, in text form (no rendered
diagram needed — the relations below are the diagram):

- **`Conversation` → `Message`**: one-to-many via `Message.conversationId`. Every
  inbound customer message and every outbound AI/human/system message is a row here, in
  a single ordered timeline per conversation.
- **`Message` → `AiUsageLog`**: one-to-one, *optional*, via `AiUsageLog.messageId
@unique`. Only messages produced by an LLM call get a usage log row — customer
  messages and plain system messages never do.
- **`Conversation` → `AiUsageLog`**: one-to-many, *directly* (not only reachable through
  `Message`) via `AiUsageLog.conversationId`. This denormalized FK exists so
  cost/usage aggregation and dashboards (`docs/token-optimization-strategy.md` Rule 10)
  can query `ai_usage_logs` filtered by `(tenantId, conversationId)` or
  `(tenantId, agentType, createdAt)` without a join through `messages`.
- **`Event` is deliberately NOT foreign-keyed to `Conversation` or `Message`.** It's a
  flat, generic append-only log (`type` string + `payload` Json); a `message.received`
  event's `payload` carries `conversationId`/`messageId` as *data*, not as a relational
  constraint. This is intentional: the event bus must be able to log events about
  entities it has no FK to (e.g. `integration.connected` has no conversation at all),
  and consumers (n8n `Workflow` matching) key off `payload` contents, not joins.
- **`Event` → `WorkflowExecution`**: one-to-many via `WorkflowExecution.eventId`
  (optional) — this is the one place an `Event` row *is* referenced by FK, because a
  triggered n8n run needs to point back at exactly which event caused it.

So end to end: a customer message lands as a `Message` (sender `CUSTOMER`) →
`message.received` `Event` is logged → the multi-agent pipeline
(`docs/multi-agent-architecture.md`) runs and may call the AI provider one or more
times, each call producing an `AiUsageLog` linked to both the `Conversation` and the
resulting `Message` (sender `AI`) → if any `Workflow` is subscribed to
`message.received` (or a downstream event like `action.executed`), a
`WorkflowExecution` is created linked back to that `Event`.
