# Quick start

## Requirements

Node 20+, pnpm 9+, Docker.

## One command

```bash
./install.sh   # dependencies, containers, schema
./start.sh     # postgres, redis, n8n, rasa, then the API and dashboard
```

| Service | URL |
|---|---|
| Dashboard | <http://localhost:3000> |
| API | <http://localhost:3001> |
| n8n | <http://localhost:5678> |
| Rasa (internal only) | <http://localhost:5005> |

## Manually

```bash
cp .env.example .env            # provider keys and secrets
pnpm install
docker compose up -d postgres redis n8n rasa
pnpm prisma:generate
pnpm db:migrate:deploy          # applies migrations, never resets data
pnpm prisma:seed                # first platform admin from BOOTSTRAP_ADMIN_*
pnpm dev
```

No demo data is created. Sign up in the dashboard to create a real business; it picks an
industry template and configures itself.

!!! tip "Rasa is optional"
    With `RASA_ENABLED=false` every message uses the LLM router. See [Intent routing](rasa-nlu.md).

## Tests

```bash
pnpm test                # unit tests, no services needed
pnpm db:reset:test       # isolated ai_employee_test database
pnpm test:integration    # real app + Postgres + Redis, scripted AI model
```

Integration tests refuse to run unless the database name ends in `_test`.

!!! note "Redis port"
    If Redis runs in Docker mapped to another host port, set `REDIS_URL` (for example
    `redis://localhost:6380`) when running integration tests.
