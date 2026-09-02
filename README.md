
# AI Employee

<img width="1389" height="1197" alt="diagram-export-8-26-2026-12_21_53-AM" src="https://github.com/user-attachments/assets/a54d22e9-d1ee-4e4d-ba74-3c3c9083e3d1" />

A reusable, multi-tenant AI Employee platform: build once, connect to any business
system (salon, hotel, clinic, e-commerce, CRM, vehicle service, ERP, or custom apps)
through a generic Integration Layer. See `docs/architecture.md` for the full design.

## Status

This is a structural scaffold covering all 8 MVP phases (see
`docs/mvp-implementation-plan.md`). Core wiring — auth, multi-tenancy, the
Router/Support/Knowledge/Action agent pipeline, the Integration API contract, the
dashboard shell, and Platform Administration & Tenant Management (global user identity,
tenant membership, a `SUPER_ADMIN` platform role separate from tenant roles) — is live
and verified end-to-end. Deep business logic in a few areas (PDF/DOCX extraction,
realtime channel delivery, billing/plans) and production hardening are follow-up work
per phase — see `docs/mvp-implementation-plan.md` for exactly what's real vs. stubbed.

## Quick start

```bash
./install.sh   # deps, containers, schema, seed data
./start.sh     # starts api+web, opens the dashboard
```

Or manually:

```bash
cp .env.example .env        # fill in provider keys etc.
pnpm install
docker compose up -d postgres redis n8n
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed            # creates the demo accounts below
pnpm dev                    # runs apps/api + apps/web via turbo
```

- API: http://localhost:3001
- Web dashboard: http://localhost:3000
- n8n: http://localhost:5678

## Demo accounts

Created by `pnpm prisma:seed` (`apps/api/scripts/seed.ts`, idempotent — safe to re-run,
resets both accounts back to these values). Dev-only; change or remove before any real
deployment.

| Role | Email | Password | Notes |
|---|---|---|---|
| Platform super admin | `admin@davinlabs.com` | `ChangeMe123!` | `platformRole: SUPER_ADMIN` — sees the Admin section (Tenants, Platform Users). Also owns its own "DavinLabs" tenant, since every account needs a home tenant. |
| Salon tenant owner | `owner@acme.test` | `ChangeMe123!` | `TenantRole: OWNER` on the seeded "Acme Salon" tenant — ordinary customer-side login, no platform access. |

To promote any other existing user to platform super admin:
`pnpm --filter @ai-employee/api run promote-admin <email>`.

## Monorepo layout

See `docs/architecture.md#monorepo-layout`.

## Docs

- [`docs/architecture.md`](docs/architecture.md) — includes "Platform Administration & Tenant Management"
- [`docs/database-schema.md`](docs/database-schema.md)
- [`docs/multi-agent-architecture.md`](docs/multi-agent-architecture.md)
- [`docs/token-optimization-strategy.md`](docs/token-optimization-strategy.md)
- [`docs/integration-api-contract.md`](docs/integration-api-contract.md)
- [`docs/integration-sdk.md`](docs/integration-sdk.md)
- [`docs/n8n-architecture.md`](docs/n8n-architecture.md)
- [`docs/mvp-implementation-plan.md`](docs/mvp-implementation-plan.md)
