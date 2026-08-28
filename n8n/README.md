# n8n Workflows

n8n runs as the `n8n` service in the root `docker-compose.yml`, exposed at `http://localhost:5678` and protected with HTTP basic auth using the `N8N_BASIC_AUTH_USER` / `N8N_BASIC_AUTH_PASSWORD` credentials from `.env` (see `.env.example`'s `N8N_*` variables — `N8N_API_URL` and `N8N_API_KEY` in particular are what the API uses to call n8n's REST API).

Workflows are triggered from the AI Employee API via `N8nService.triggerWorkflow(n8nWorkflowId, payload)` (`apps/api/src/modules/n8n/n8n.service.ts`), invoked automatically by the event-driven bridge in `apps/api/src/modules/workflow/workflow-event-listener.service.ts` whenever an internal event (see `EVENT_TYPES` in `apps/api/src/events/event-types.const.ts`) matches an enabled `Workflow.triggerEventType` row for a tenant.

The `.json` files under `n8n/workflows/` are example workflow exports in n8n's own export shape (`{ name, nodes, connections }`) — import one via the n8n UI (`Workflows > Import from File`) or its REST API (`POST /api/v1/workflows`), then copy the resulting n8n-assigned workflow id into a `Workflow.n8nWorkflowId` row via `POST /workflows`. `docker-compose.yml` also mounts this directory into the container at `/home/node/workflows` for convenience, but n8n does not auto-import from that path — it's there for reference/manual import only.

## Environment variables in workflow expressions

The example workflows read config with `{{ $env.CRM_BASE_URL }}` / `{{ $env.SLACK_WEBHOOK_URL }}`. n8n **2.x blocks `$env` in expressions by default** (`N8N_BLOCK_ENV_ACCESS_IN_NODE=true`), which surfaces as **`access to env vars denied`** in a node like *Check CRM For Existing Lead*. `docker-compose.yml` sets `N8N_BLOCK_ENV_ACCESS_IN_NODE: "false"` to allow it, and passes `CRM_BASE_URL` / `SLACK_WEBHOOK_URL` (from root `.env`, see `.env.example`) into the container. Point `CRM_BASE_URL` at your real CRM; the default `http://host.docker.internal:3999` is a placeholder and will just give a connection error until something is listening there. After changing any of these, recreate the container: `docker compose up -d n8n`.
