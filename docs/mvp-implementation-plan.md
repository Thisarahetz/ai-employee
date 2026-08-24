# MVP Implementation Plan

The 8 MVP phases, as a checklist. Status reflects a **freshly-scaffolded monorepo**: root
tooling, the Prisma schema, Docker Compose, and this design-doc set are in place; deep
business logic inside `apps/api`/`apps/web`/`packages/*` is skeleton/in-progress per the
concurrent workstreams described in [`docs/architecture.md`](architecture.md). This
matches [`README.md`](../README.md)'s status note: "Core wiring ... is in place with
working skeleton logic; deep business logic and production hardening are follow-up work
per phase." Update the checkboxes here as work actually lands — this doc exists so
whoever picks up the next phase knows exactly what's real vs. still open, not to look
finished.

Legend: `[x]` done, `[ ]` not yet (including "exists but is a stub/partial" — see the
item text for the nuance in those cases).

## Phase 1 — Foundation

- [x] Monorepo workspace scaffold: pnpm workspaces + Turbo pipelines (`package.json`,
      `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`)
- [x] Prisma schema covering the full domain model, Postgres + pgvector configured
      (`prisma/schema.prisma`, `docker-compose.yml`'s `pgvector/pgvector` image)
- [x] Docker Compose for local Postgres/Redis/n8n (`docker-compose.yml`,
      `docker/postgres/init`)
- [x] Env var contract documented (`.env.example`)
- [x] Architecture + full design-doc set (`docs/`)
- [x] Auth scaffolded: JWT access/refresh issuance, password hashing, guards
      (`apps/api/src/modules/auth`) — skeleton logic, not yet security-reviewed/hardened
- [x] Multi-tenancy scaffolded: `TenantContext` derivation + tenant-scoping Prisma
      Client extension (`apps/api/src/modules/tenant`) — skeleton logic
- [ ] RBAC permission checks wired end-to-end against
      `packages/shared/src/constants/permissions.ts` on every protected route (guard
      exists in concept; per-route permission annotations not yet audited for coverage)
- [ ] Baseline Postgres migration applied + a seed script (default roles/permissions per
      `DEFAULT_ROLE_PERMISSIONS`, a demo tenant/business/channel for local dev)
- [ ] CI pipeline (lint/typecheck/test on PR)

## Phase 2 — Conversations

- [x] Conversation/Message/Customer domain modules scaffolded with basic CRUD
      (`apps/api/src/modules/conversation`, `apps/api/src/modules/customer`)
- [x] Channel adapter interface scaffolded with at least one channel implementation
      (`packages/channel-sdk`)
- [ ] Full inbound/outbound round trip proven against a real channel provider (WhatsApp
      Cloud API or website-chat widget) end to end, not just the adapter interface
- [ ] Redis/BullMQ queue processing wired end-to-end for inbound message handling, with
      retry + dead-letter queue — not yet; messages currently assumed to be handled
      synchronously in the scaffold
- [ ] Automatic `ConversationSummary` generation job — the model/`coveredUntil` field
      exist and the context builder can read a summary, but nothing yet decides "this
      conversation is long enough, summarize it" and writes the row (see
      `docs/token-optimization-strategy.md` Rule 9)
- [ ] `apps/web` conversation inbox UI beyond a static shell

## Phase 3 — AI Core

- [x] `AIProvider` abstraction scaffolded for OpenAI + Anthropic (`packages/ai-core`)
- [x] `AiAgent`/`AiConfiguration` models + basic CRUD skeleton
      (`apps/api/src/modules/ai-provider`, `apps/api/src/modules/ai-agent`)
- [x] Router Agent skeleton (intent-classification scaffold)
- [ ] Support / Knowledge / Action agents fully implemented against real provider calls
      (currently skeleton/stubbed responses, not exercised against a live API key)
- [ ] `AgentOrchestratorService` wiring `message.received` → Router → specialized agent
      → reply, proven end-to-end
- [ ] `AiUsageLog` populated on every real model call, with token counts/cost verified
      against actual provider responses (not just a schema that could hold them)
- [ ] Provider-side prompt caching verified in practice (stable-prefix structure is
      designed per `docs/token-optimization-strategy.md` Rule 8, cache-hit behavior not
      yet measured)
- [ ] Streaming responses back to channels

## Phase 4 — Knowledge (RAG)

- [x] `KnowledgeBase`/`Document`/`DocumentChunk` models + pgvector extension enabled in
      the schema
- [x] `knowledge-base` and `rag` module skeletons
      (`apps/api/src/modules/knowledge-base`, `apps/api/src/modules/rag`)
- [ ] Document upload endpoint + S3-compatible storage wiring (`STORAGE_DRIVER=s3` env
      vars declared in `.env.example`, not yet wired to an upload flow)
- [ ] RAG pipeline exists but PDF/DOCX text extraction is a stub — only `TEXT`/`FAQ`
      source types are realistically supported end-to-end today
- [ ] Embedding generation + raw-SQL insert into `document_chunks.embedding`
      (`$executeRaw`, see `docs/database-schema.md`)
- [ ] Vector similarity search (`$queryRaw`, top-K retrieval) wired into the Knowledge
      Agent's context loading
- [ ] Knowledge base management UI (`apps/web`)

## Phase 5 — Actions (Integration Layer)

- [x] `Integration`/`IntegrationCredential`/`IntegrationAction` models + encrypted
      credential storage pattern (`CREDENTIALS_ENCRYPTION_KEY`)
- [x] `external-action` module skeleton implementing the `GET /ai/actions` /
      `POST /ai/execute` contract shape (`apps/api/src/modules/external-action`)
- [x] Integration SDK scaffold: `registerAction()` + Express/NestJS adapter shape
      (`packages/integration-sdk`)
- [ ] `Idempotency-Key` deduplication actually enforced (a real store + lookup on both
      the AI Employee side and the SDK side), not just accepted as a header
- [ ] Periodic action-discovery job that refreshes `IntegrationAction` rows by polling
      `GET /ai/actions` on a schedule, rather than only at manual setup time
- [ ] Action Agent wired to the real `IntegrationAction` catalogue via provider-native
      function-calling (currently designed, not exercised against a live model)
- [ ] At least one demo external integration exercising the full contract end-to-end
      (useful both as a test fixture and as a reference implementation for third
      parties)
- [ ] Integrations management UI (`apps/web`)

## Phase 6 — n8n Workflows

- [x] n8n running via `docker-compose.yml`, reachable locally at `N8N_HOST:N8N_PORT`
- [x] `Workflow`/`WorkflowExecution` models + `N8nService` trigger-client skeleton
      (`apps/api/src/modules/n8n`, `apps/api/src/modules/workflow`)
- [x] Event bus (`Event` model) persisting every emitted event
- [x] Worked example workflow committed
      (`n8n/workflows/example-new-customer-lead.json`)
- [ ] Event → matching enabled `Workflow` → actual n8n trigger proven end-to-end for at
      least one event type (webhook call succeeding, `WorkflowExecution` row created)
- [ ] Execution status write-back (`WorkflowExecution.status`/`output`/`errorMessage`)
      implemented — polling n8n's execution API vs. a callback endpoint is not yet
      decided, see `docs/n8n-architecture.md`
- [ ] Workflow management UI (`apps/web`)

## Phase 7 — Human Handoff

- [x] `HumanHandoff` model + `HandoffReason`/`HandoffStatus` enums
- [ ] Handoff-trigger heuristics implemented and tuned: `CUSTOMER_REQUEST` detection,
      `LOW_CONFIDENCE` threshold, `UNSUPPORTED_REQUEST`/`SENSITIVE_REQUEST` detection,
      `REPEATED_FAILURE` counting (see `docs/multi-agent-architecture.md`) — currently
      designed, thresholds/detection logic not yet tuned against real conversations
- [ ] Conversation state transition (`status → HUMAN_HANDLING`, `currentAgent → HUMAN`,
      `assignedUserId`) wired end-to-end from a handoff trigger
- [ ] Real-time notification delivery to available human agents (websocket or polling —
      `Notification` rows can be created, nothing yet pushes them live to `apps/web`)
- [ ] `human_handoff.requested`/`.completed` wired to an actual n8n alert workflow
      (depends on Phase 6's event-to-n8n trigger being proven)
- [ ] Agent handoff inbox UI with claim/resolve actions (`apps/web`)

## Phase 8 — Production Readiness

- [ ] Structured logging + request tracing across `apps/api`
- [ ] Rate limiting / abuse protection on public channel webhooks (WhatsApp/email
      inbound endpoints are, by nature, unauthenticated-by-default attack surface)
- [ ] Secrets rotation runbook (`CREDENTIALS_ENCRYPTION_KEY`, `JWT_ACCESS_SECRET` /
      `JWT_REFRESH_SECRET`, `N8N_ENCRYPTION_KEY`, `WEBHOOK_SIGNING_SECRET`)
- [ ] Horizontal scaling story for BullMQ workers (once Phase 2's queue processing
      exists at all)
- [ ] Cost/latency/failure observability dashboards built on `AiUsageLog` and
      `WorkflowExecution` (data is being collected per Phases 3/6; no dashboard yet)
- [ ] Backup/restore runbook for Postgres, including `pgvector` embedding data
- [ ] Load testing
- [ ] Terraform/k8s manifests (`infrastructure/` is currently a placeholder directory)

## Cross-references

- [`docs/architecture.md`](architecture.md) — system-level design these phases
  implement.
- [`docs/database-schema.md`](database-schema.md),
  [`docs/multi-agent-architecture.md`](multi-agent-architecture.md),
  [`docs/token-optimization-strategy.md`](token-optimization-strategy.md),
  [`docs/integration-api-contract.md`](integration-api-contract.md),
  [`docs/integration-sdk.md`](integration-sdk.md),
  [`docs/n8n-architecture.md`](n8n-architecture.md) — the per-domain design docs each
  phase above draws on.
