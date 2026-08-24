# AI Employee

A reusable, multi-tenant AI Employee platform: build once, connect to any business
system (salon, hotel, clinic, e-commerce, CRM, vehicle service, ERP, or custom apps)
through a generic Integration Layer. See `docs/architecture.md` for the full design.

## Status

This is a structural scaffold covering all 8 MVP phases (see
`docs/mvp-implementation-plan.md`). Core wiring (auth, multi-tenancy, the
Router/Support/Knowledge/Action agent pipeline, the Integration API contract, and the
dashboard shell) is in place with working skeleton logic; deep business logic and
production hardening are follow-up work per phase.

## Quick start

```bash
cp .env.example .env        # fill in provider keys etc.
pnpm install
docker compose up -d postgres redis n8n
pnpm prisma:generate
pnpm prisma:migrate
pnpm dev                    # runs apps/api + apps/web via turbo
```

- API: http://localhost:3001
- Web dashboard: http://localhost:3000
- n8n: http://localhost:5678

## Monorepo layout

See `docs/architecture.md#monorepo-layout`.

## Docs

- [`docs/architecture.md`](docs/architecture.md)
- [`docs/database-schema.md`](docs/database-schema.md)
- [`docs/multi-agent-architecture.md`](docs/multi-agent-architecture.md)
- [`docs/token-optimization-strategy.md`](docs/token-optimization-strategy.md)
- [`docs/integration-api-contract.md`](docs/integration-api-contract.md)
- [`docs/integration-sdk.md`](docs/integration-sdk.md)
- [`docs/n8n-architecture.md`](docs/n8n-architecture.md)
- [`docs/mvp-implementation-plan.md`](docs/mvp-implementation-plan.md)
