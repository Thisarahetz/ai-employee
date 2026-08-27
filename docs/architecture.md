# AI Employee — Architecture

## Vision

AI Employee is built once and connected to many external business systems (salon,
hotel, clinic, e-commerce, CRM, vehicle service, ERP, custom apps) through a generic
Integration Layer. It contains **no business-specific logic** — every external system
describes its own available actions; AI Employee only requests them. External systems
must keep working if AI Employee is offline; AI Employee is an optional add-on, never a
hard dependency.

## High-level flow

```
                         CUSTOMER
                            │
        ┌───────────────────┼────────────────────┐
        │                   │                    │
     WhatsApp          Website Chat            Email
        │                   │                    │
        └───────────────────┼────────────────────┘
                            ↓
                    CHANNEL ADAPTER
                            ↓
                    CONVERSATION SERVICE
                            ↓
                      ROUTER AGENT
                            ↓
            ┌───────────────┼────────────────┐
            │               │                │
            ↓               ↓                ↓
       SUPPORT AGENT   KNOWLEDGE AGENT   ACTION AGENT
            │               │                │
            │               ↓                ↓
            │              RAG        INTEGRATION LAYER
            │                                  │
            └──────────────────────────────────┘
                            ↓
                    RESPONSE SERVICE
                            ↓
                      CUSTOMER
```

## Multi-tenancy

Every tenant-scoped Prisma model carries `tenantId` (see `prisma/schema.prisma`).
`TenantMiddleware` (`apps/api/src/common/tenant/tenant.middleware.ts`) verifies the
caller's access JWT on every request and populates `request.tenantContext` — a
`{ tenantId, userId, role, permissions, platformRole }` object every tenant-scoped
service takes as an explicit parameter and filters its Prisma queries by
(`where: { id, tenantId }`, never a bare `where: { id }`). This is a *convention*
enforced by consistent service-layer code, not a database-level or Prisma-extension
guarantee — reviewers should treat "does this query include `tenantId`" as the one
recurring thing to check in any new tenant-scoped module.

## Platform Administration & Tenant Management

AI Employee runs as a SaaS product with two independent, deliberately separate levels
of access — mixing them up (e.g. checking a platform role where a tenant role was
meant) is the one RBAC mistake this design is built to make structurally awkward:

```
AI Employee Platform
        │
        ├── Platform Admin(s) — User.platformRole, e.g. SUPER_ADMIN
        │
        ├── Tenant A — Salon
        │     ├── Ada  — TenantMembership.role: OWNER
        │     ├── Mo   — TenantMembership.role: MANAGER
        │     └── ...
        ├── Tenant B — Hotel
        └── Tenant C — Clinic
```

**`User` is a global identity, not a tenant-scoped row.** One person (one email,
globally unique) can belong to multiple tenants with different roles in each — an
agency managing several businesses, or a platform admin who is also a paying tenant
owner. `email` is the join key precisely because there's no tenant to disambiguate it
by.

**`TenantMembership`** (the `tenant_users` table) is where a person's relationship to
one specific tenant lives: `{ tenantId, userId, role, status }`. Deleting someone from
a tenant deletes their membership row, never their `User` — they may still belong to
other tenants. A tenant can never end up with zero active `OWNER` memberships
(`UserService.guardLastOwner`, `apps/api/src/modules/user/user.service.ts`).

**Two independent role enums, checked by two independent guards:**

| | Values | Where it's checked | Settable via |
|---|---|---|---|
| `TenantRole` | `OWNER > ADMIN > MANAGER > EMPLOYEE` | `RolesGuard`, against a static `TENANT_ROLE_PERMISSIONS` map (`auth.service.ts`) — `OWNER` gets `['*']` | `POST /users/invite`, `PATCH /users/:id` (tenant "Team" management) |
| `PlatformRole` | `NONE \| SUPER_ADMIN` | `PlatformAdminGuard`, gating `/admin/*` only | `pnpm --filter @ai-employee/api promote-admin <email>` to bootstrap the first one; after that, `PATCH /admin/users/:id` from the console (a `SUPER_ADMIN` can grant/revoke it, except the last one) |

`PlatformAdminGuard` does a two-stage check: a cheap claim check on the access token,
then a **live DB re-check** of the caller's `platformRole` + `status`. Revoking someone's
platform access (or disabling their account) in the console therefore takes effect on
their very next `/admin` request, not whenever their ~15-min access token happens to
expire.

`TenantRole` is a fixed enum rather than a customizable per-tenant table on purpose —
avoids over-engineering RBAC before there's a real need for custom permission sets.
`PlatformRole` only has one real tier for the MVP; `PLATFORM_ADMIN`/`SUPPORT_ADMIN` are
natural additions later that don't require a schema change (see the enum's doc comment
in `schema.prisma`).

**Auth flow**: `POST /auth/login` looks the `User` up by its now-globally-unique email,
loads all their active `TenantMembership`s, and issues a JWT scoped to one of them
(their first/oldest by default) — the response also includes the full membership list
so the web app can render a tenant switcher. `POST /auth/switch-tenant` re-issues
tokens scoped to a different membership without a second password prompt. A platform
admin with zero tenant memberships can still log in and use `/admin/*` — their token
just carries `tenantId: null`, and the web app routes them straight to the standalone
console. Login (and refresh) reject a `User` whose `status` is `DISABLED`.

`POST /auth/signup` (public, unauthenticated) always creates a brand-new `User` and
**rejects an already-registered email** rather than silently attaching a new tenant to
it — doing otherwise would let anyone who merely knows someone's email address get
issued a session as them. `POST /admin/tenants` (trusted, `PlatformAdminGuard`-gated)
is the one place that *can* attach a new tenant to an existing identity, since it never
logs the caller in as that user.

**The Platform Super Admin console** (`apps/web/src/app/(platform)`, API in
`apps/api/src/modules/admin`) is a standalone shell — its own sidebar (just **Tenants**
and **Platform Users**), no tenant switcher, no workspace nav. A pure platform admin
lands here on login; a `SUPER_ADMIN` who also owns a tenant gets a cross-link from the
workspace sidebar. Capabilities:

- **Tenants** — create/list/search, view members, edit name/plan, and suspend/reactivate.
- **Platform Users** — list/search every global identity; per user, grant/revoke
  `SUPER_ADMIN` and enable/disable the account. Guardrails: you can't disable your own
  account, and the **last active super admin** can't be demoted or disabled by anyone.
  Disabling clears the refresh token so the session can't outlive the current access token.
- Every mutation writes a **`PlatformAuditLog`** row (`actor`, `action`, `target`,
  before/after) — surfaced as a "Recent admin activity" panel on each tenant/user page
  and queryable at `GET /admin/audit-log`. It is deliberately *not* tenant-scoped (unlike
  `AuditLog`), so it survives the target tenant being deleted.

**Explicitly not built yet** (real, standalone features, not stubbed): subscription
plans, billing, system health monitoring, an error-log viewer, and platform-wide AI
usage/cost dashboards — see `docs/mvp-implementation-plan.md`.

## Multi-agent pipeline (see `docs/multi-agent-architecture.md`)

A single large agent with every tool/document/history loaded is deliberately avoided.
Instead: a cheap **Router Agent** classifies intent only, then hands off to exactly one
specialized agent (**Support**, **Knowledge**, **Action**) that loads only the minimal
context it needs. See `docs/token-optimization-strategy.md` for the full rationale.

## Generic integration (see `docs/integration-api-contract.md`)

External systems implement two endpoints (`GET /ai/actions`, `POST /ai/execute`) or
use the Integration SDK (`packages/integration-sdk`) to auto-expose them from
`registerAction()` calls. AI Employee discovers actions dynamically per tenant and
never hardcodes what a "salon" or "hotel" looks like.

## Automation (n8n)

n8n orchestrates automation (reminders, follow-ups, notifications, third-party
syncs) triggered by AI Employee's internal event bus. Core business logic, validation,
and permissions stay in NestJS / the external system — n8n workflows are orchestration,
not source of truth. See `docs/n8n-architecture.md`.

## Channels

Channel Adapters normalize inbound messages from WhatsApp / website chat / email (and
future channels) into a single `NormalizedMessage` shape consumed by the Conversation
Service, and normalize outbound AI/human responses back into each channel's format.
Adding a channel means implementing the adapter interface in `packages/channel-sdk` —
no change to core AI logic.

## Monorepo layout

```
ai-employee/
├── apps/
│   ├── web/            # Next.js admin dashboard
│   └── api/             # NestJS backend
├── packages/
│   ├── shared/           # cross-cutting DTOs/enums/utilities
│   ├── types/             # shared TypeScript types
│   ├── ai-core/            # AIProvider abstraction (OpenAI, Anthropic)
│   ├── integration-sdk/     # external-system SDK (registerAction, /ai/actions, /ai/execute)
│   └── channel-sdk/          # channel adapter interface + built-in adapters
├── docker/                    # postgres init, misc container config
├── infrastructure/             # deployment config (future: Terraform/k8s)
├── n8n/                          # example workflows, n8n-specific docs
├── prisma/                        # schema.prisma (single source of DB truth)
└── docs/                           # this design doc set
```

## Related docs

- `docs/database-schema.md` — narrative walkthrough of `prisma/schema.prisma`
- `docs/multi-agent-architecture.md` — Router/Support/Knowledge/Action agent design
- `docs/token-optimization-strategy.md` — the 14 token-optimization rules and where each is implemented
- `docs/integration-api-contract.md` — `/ai/actions` + `/ai/execute` contract
- `docs/integration-sdk.md` — Integration SDK design
- `docs/n8n-architecture.md` — event → workflow → automation flow
- `docs/mvp-implementation-plan.md` — the 8-phase build plan and current status
