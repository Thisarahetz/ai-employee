# n8n Workflows & Common Template System

n8n runs as the `n8n` service in root `docker-compose.yml`, exposed at `http://localhost:5678` and protected with HTTP basic auth credentials from `.env` (`N8N_BASIC_AUTH_USER` / `N8N_BASIC_AUTH_PASSWORD`). The AI Employee API communicates with n8n via `N8N_API_URL` using `N8N_API_KEY`.

Workflows are triggered from the AI Employee API via `N8nService.triggerWorkflow(n8nWorkflowId, payload)` (`apps/api/src/modules/n8n/n8n.service.ts`), invoked automatically by the event-driven bridge in `apps/api/src/modules/workflow/workflow-event-listener.service.ts` whenever an internal event matches an enabled `Workflow.triggerEventType` row for a tenant.

---

## Reusable Workflow Templates Catalog

Standardized, common workflow templates are stored in `n8n/templates/catalog.json` and bundled in `n8n/templates/common-templates-bundle.json`.

| Template ID | Name | Trigger Event | Description |
| :--- | :--- | :--- | :--- |
| `appointment-lifecycle` | Appointment Lifecycle & Follow-up Sequence | `appointment.created` | Multi-channel: WhatsApp confirmation, email receipt, 24h reminder, and post-visit review request. |
| `scheduled-reminders` | Scheduled Appointment Reminders (24h & 2h) | `appointment.created` | Timed notifications 24 hours and 2 hours before appointment with confirm/reschedule options. |
| `lead-followup` | New Customer Lead Follow-up Sequence | `customer.created` | Multi-day lead nurture: Day 0 welcome & pricing, Day 1 follow-up, Day 3 offer, and sales alert. |
| `salon-retention` | Customer Retention & 30-Day Rebooking | `appointment.completed` | Post-visit retention: Day 1 review request, followed by a personalized 30-day rebooking reminder. |
| `crm-lead-sync` | CRM Lead Sync & Slack Notification | `customer.created` | Looks up customer in external CRM, creates lead profile, and alerts sales team via Slack. |

---

## How Any System Can Import These Workflows

### 1. Via AI Employee Platform REST API (Multi-Tenant One-Click Import)
Any tenant or external client can browse templates and import them with a single API call:

```bash
# List available common templates
curl http://localhost:3001/api/v1/workflows/templates

# Import a template for a tenant
curl -X POST http://localhost:3001/api/v1/workflows/templates/appointment-lifecycle/import \
  -H "Authorization: Bearer <tenant_jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "isEnabled": true }'
```

### 2. Via CLI Setup Script
To provision or sync all common workflow templates for a tenant automatically:

```bash
pnpm --filter @ai-employee/api exec ts-node --transpile-only scripts/setup-n8n-workflows.ts
```

### 3. Direct Import into Any External n8n Instance
If using a standalone external n8n instance (n8n Cloud, self-hosted Docker, etc.):
1. Open n8n UI (`http://localhost:5678`).
2. Go to **Workflows > Import from File**.
3. Select any `.json` file from `n8n/workflows/` or the combined bundle `n8n/templates/common-templates-bundle.json`.
4. The workflow will import with all nodes and connections intact.

---

## Running Real End-to-End Workflow Tests

A dedicated real-test suite tests all 5 workflows against live n8n webhooks and checks execution traces:

```bash
pnpm --filter @ai-employee/api exec ts-node --transpile-only scripts/test-n8n-workflows.ts
```

This verifies:
- n8n API connectivity and workflow activation.
- Real webhook delivery and node execution.
- Successful callbacks to AI Employee channels (`/channels/send`) and notifications (`/notifications/email`, `/notifications/slack`).
- 0 execution errors across all sequences.

---

## Environment Variables & Webhook Callbacks

In `.env`, the following variables configure workflow integrations:
- `WHATSAPP_API_URL`: `http://host.docker.internal:3001/api/v1/channels/send`
- `EMAIL_API_URL`: `http://host.docker.internal:3001/api/v1/notifications/email`
- `SLACK_WEBHOOK_URL`: `http://host.docker.internal:3001/api/v1/notifications/slack`
- `CRM_BASE_URL`: your real CRM's REST endpoint (empty = CRM nodes fail visibly; there is no mock CRM)
- `GLOWDESK_API_URL`: `http://host.docker.internal:3141`
- `AI_EMPLOYEE_SERVICE_TOKEN`: set from `INTERNAL_SERVICE_TOKEN`. Every callback node sends it as
  the `x-service-token` header — `/channels/send` and `/notifications/*` reject calls without it.

Workflow messages use the tenant's business name from the trigger payload
(`body.business.name`), never a hardcoded one.

