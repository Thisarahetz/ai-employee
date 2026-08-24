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
`apps/api`'s `TenantModule` derives a `TenantContext` from the authenticated JWT and:

1. Injects `tenantId` into every Prisma query via a Prisma Client extension —
   application code never has to remember to filter by tenant, and cross-tenant reads
   are structurally prevented rather than relying on per-service discipline.
2. Rejects any request whose resource `tenantId` doesn't match the caller's tenant
   (404, not 403, to avoid confirming the resource exists in another tenant).

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
