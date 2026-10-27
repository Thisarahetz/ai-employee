
# AI Employee

<img width="1389" height="1197" alt="diagram-export-8-26-2026-12_21_53-AM" src="https://github.com/user-attachments/assets/a54d22e9-d1ee-4e4d-ba74-3c3c9083e3d1" />

A reusable, multi-tenant AI Employee platform: build once, connect to any business
system (salon, hotel, clinic, e-commerce, CRM, vehicle service, ERP, or custom apps)
through a generic Integration Layer. See `docs/architecture.md` for the full design.

> 📖 **Live Documentation & Interactive Architecture**: **[ai-employee-api-ivory.vercel.app](https://ai-employee-api-ivory.vercel.app)**


## Status

This is a structural scaffold covering all 8 MVP phases (see
`docs/mvp-implementation-plan.md`). Core wiring — auth, multi-tenancy, the
Router/Support/Knowledge/Action agent pipeline, the Integration API contract, the
dashboard shell, and Platform Administration & Tenant Management (global user identity,
tenant membership, a `SUPER_ADMIN` platform role separate from tenant roles) — is live
and verified end-to-end. Deep business logic in a few areas (PDF/DOCX extraction,
realtime channel delivery, billing/plans) and production hardening are follow-up work
per phase — see `docs/mvp-implementation-plan.md` for exactly what's real vs. stubbed.

> 📘 **Full Documentation & Walkthrough**: See [**`SETUP.md`**](SETUP.md) for the Complete Setup & Operations Guide, Multi-Branch Security, and User Management walkthrough.

## Quick start

```bash
./install.sh   # deps, containers, schema, seed data
./start.sh     # starts api+web, opens the dashboard
```

Or manually:

```bash
cp .env.example .env        # fill in provider keys and secrets
pnpm install
docker compose up -d postgres redis n8n rasa   # rasa is optional (see below)
pnpm prisma:generate
pnpm db:migrate:deploy      # applies prisma/migrations (never resets data)
pnpm prisma:seed            # creates the first platform admin from BOOTSTRAP_ADMIN_* (nothing else)
pnpm dev                    # runs apps/api + apps/web via turbo
```

No demo tenants, customers or sample data are created. Sign up in the web app to
create a real business; it then picks an industry template and configures itself.

- API: http://localhost:3001
- Web dashboard: http://localhost:3000
- n8n: http://localhost:5678
- Rasa (intent classifier, internal only): http://localhost:5005

To promote an existing user to platform super admin:
`pnpm --filter @ai-employee/api run promote-admin <email>`.

## Customer channels and replies

Customers reach the business on **WhatsApp, website chat, email and phone calls**. Connect
them in the dashboard under **Channels** (Add channel, then open it to finish setup). Each
channel card shows **Active/Inactive**, **Connected / Setup needed**, the time of the last
customer message (the real proof it works) and a **Send test** button.

Every channel feeds the same reply pipeline, so a phone call is answered exactly like a chat:

1. A person is asked for: handed to staff (no AI).
2. Greetings and thanks: fixed reply (free).
3. **Rasa** classifies the message and picks the agent without an LLM router call
   (`docs/rasa-nlu.md`). Anything it is unsure about falls back to the LLM router.
4. **Saved answers** the owner approved are used first; reply modes **Hybrid / No-AI / AI**
   decide how much AI is used (`docs/reply-engine.md`).
5. Knowledge, booking and support agents answer with real data through tools. When AI is
   unavailable or the request can't be completed safely, a person is brought in.

- **Languages** — English, Sinhala and Singlish replies, and a Sinhala dashboard.
- **Phone calls (Twilio)** — Twilio ConversationRelay does speech-to-text and text-to-speech;
  the API handles the call over a signed WebSocket. Supports a transfer number for handoffs,
  a spoken clarification before handing over, and English/Sinhala speech. Add a
  *Phone calls (Twilio)* channel, paste the webhook URL into Twilio and save the auth token.
  Twilio needs a public HTTPS `API_URL` (for local testing, a tunnel such as ngrok).
  See `docs/voice.md`.

## AI workforce

AI employees run tasks in the background, 24/7, from a durable Redis (BullMQ) queue:

- **Commands & tasks** — the owner chats in the Command Center; work becomes tasks
  with a full step log, verified outcomes and per-task cost.
- **Schedules** — recurring cron work per employee (Schedules & Limits page), evaluated in
  the business timezone; overlapping runs are skipped and a repeatedly failing schedule
  switches itself off and notifies the owner.
- **Approvals** — sensitive actions (sending messages, money, deletions) always wait for
  an owner/admin; restricted actions (permissions, credentials) can never be run by AI.
- **Safeguards** — kill switch, daily/monthly budgets measured from real provider usage,
  per-task cost cap, step cap, repeated-call detection, delegation limits, tasks/day and
  concurrency caps. Budget-blocked work resumes when the period resets.
- **Reliability** — automatic retries with backoff (honouring provider retry hints),
  heartbeats with crash recovery, and a reconciler for lost queue jobs.

- **Any industry** — editable industry templates (roles, recurring work, automation rules);
  businesses copy and customise them, platform admins manage the catalog. A business profile
  (what you do, services, hours, policies, brand voice, goals) is given to every AI employee.
- **Automations** — "when this event happens (and these conditions match), give this AI
  employee a task / notify me", with cooldowns, hourly caps, dry runs and a run log.
  Connected systems push events through signed webhooks (see
  `docs/integration-api-contract.md#webhooks`). Events caused by AI work never re-trigger
  rules unless explicitly allowed.
- **Your own AI keys** — each business can add encrypted OpenAI/Anthropic/Gemini keys.
- **Platform admin** — cross-tenant AI cost, system health and per-business AI switches.

Scale out by running extra API processes with `AI_WORKFORCE_WORKER=false` and dedicated
worker processes; execution is claimed atomically in Postgres.

## Tests

```bash
pnpm test                   # unit tests (no services needed)
pnpm db:reset:test          # create/reset the isolated ai_employee_test database
pnpm test:integration       # real app + Postgres + Redis, scripted AI model
LIVE_AI=1 pnpm --filter @ai-employee/api test:live   # one real provider call (uses credit)
```

Integration tests refuse to run unless the database name ends in `_test`, use a separate
Redis key prefix, and delete every fixture they create.

## Monorepo layout

See `docs/architecture.md#monorepo-layout`.

## Docs

The docs are a [Zensical](https://zensical.org) site (from the makers of Material for MkDocs) built
from `docs/` (`zensical.toml`):

```bash
pip install -r requirements-docs.txt   # needs Python 3.10+
zensical serve                         # live preview at http://localhost:8000
zensical build --clean                 # static site into site/ (git-ignored)
```


- [🌐 **Live Interactive Web Documentation**](https://ai-employee-api-ivory.vercel.app) — Complete interactive documentation site with diagrams, architecture, integration SDK, and API contracts
- [`docs/architecture.md`](docs/architecture.md) — includes "Platform Administration & Tenant Management"
- [`docs/database-schema.md`](docs/database-schema.md)
- [`docs/multi-agent-architecture.md`](docs/multi-agent-architecture.md)
- [`docs/token-optimization-strategy.md`](docs/token-optimization-strategy.md)
- [`docs/rasa-nlu.md`](docs/rasa-nlu.md) — Rasa-first intent routing with LLM fallback
- [`docs/reply-engine.md`](docs/reply-engine.md) — saved answers and Hybrid / No-AI / AI reply modes
- [`docs/voice.md`](docs/voice.md) — Twilio phone calls: setup, handoff, security, limits
- [`docs/integration-sdk.md`](docs/integration-sdk.md)
- [`packages/integration-sdk`](packages/integration-sdk/README.md) — Official `ai-employee-sdk` NPM package & documentation
- [`docs/npm-publishing-guide.md`](docs/npm-publishing-guide.md) — NPM package release, CI/CD, and publishing guide
- [`docs/n8n-architecture.md`](docs/n8n-architecture.md)
- [`docs/production-and-integration-guide.md`](docs/production-and-integration-guide.md) — production setup, GlowDesk quickstart & fault-isolation guarantees
- [`docs/mvp-implementation-plan.md`](docs/mvp-implementation-plan.md)
