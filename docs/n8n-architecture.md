# n8n Workflow Architecture

How AI Employee's internal event bus drives automation (reminders, follow-ups,
notifications, third-party syncs) through n8n, without any core business logic ever
living inside an n8n workflow. Owned by the integration-layer workstream:
`apps/api/src/modules/{workflow,n8n}` and `n8n/` (workflow exports, n8n-specific
config). See [`docs/architecture.md`](architecture.md#automation-n8n) for the one-line
summary this doc expands on.

## Why n8n is separate from the core pipeline

The Router/Support/Knowledge/Action agent pipeline
([`docs/multi-agent-architecture.md`](multi-agent-architecture.md)) handles the
synchronous, in-conversation loop: customer sends a message, AI Employee responds.
n8n handles everything *around* that loop that doesn't need to happen in the
request/response path — notifying a Slack channel, creating a CRM lead, sending a
follow-up email a day later, syncing a closed conversation into a reporting sheet. These
are naturally async, often involve several third-party services chained together, and
benefit from a visual, non-deploy-to-change workflow tool rather than being hardcoded
into `apps/api`.

## Flow: event → Workflow → n8n → external services

1. Something happens inside AI Employee worth automating on — a message arrives, a
   conversation closes, an action executes, a handoff is requested, an integration
   connects (any of the `EVENT_TYPES` in
   [`packages/shared/src/constants/event-types.ts`](../packages/shared/src/constants/event-types.ts)).
   The emitting module (conversation, ai-agent, external-action, etc.) persists an
   `Event` row (`type`, `payload`, `sourceService`, `tenantId`).
2. `apps/api/src/modules/n8n`'s `N8nService` (or an event listener that calls into it)
   looks up `Workflow` rows for that tenant where `triggerEventType` matches the
   event's `type` and `isEnabled` is true.
3. For each match, `N8nService.triggerWorkflow(...)` calls n8n — typically via a webhook
   trigger node's URL (n8n's normal automation-trigger mechanism) or n8n's REST API
   (`N8N_API_URL`/`N8N_API_KEY`, see `.env.example`) — passing the payload shape
   described below, and creates a `WorkflowExecution` row (`status: PENDING`, linked to
   `workflowId` and the triggering `eventId`).
4. n8n runs the workflow: calling out to Slack, email, a CRM, a spreadsheet, or looping
   back into AI Employee's own authenticated API or the external system's Integration
   Layer contract ([`docs/integration-api-contract.md`](integration-api-contract.md)) if
   the automation needs to read/write tenant data.
5. Execution outcome is written back to the `WorkflowExecution` row (`status: RUNNING →
SUCCESS`/`FAILED`, `output` or `errorMessage`, `finishedAt`) — either via n8n calling a
   status-callback endpoint on `apps/api`, or `apps/api` polling n8n's execution API by
   `n8nExecutionId`. (Which of the two is the source of truth is an implementation
   choice left to `apps/api/src/modules/n8n` — see
   [`docs/mvp-implementation-plan.md`](mvp-implementation-plan.md) for current status;
   this doc only fixes the contract, not the transport.)

## Payload shape

Every workflow trigger receives the same envelope, regardless of `eventType`, so n8n
workflows can generically branch on it and can always trust the top-level identifiers
are present:

```json
{
  "tenantId": "tnt_abc123",
  "businessId": "biz_def456",
  "customerId": "cus_ghi789",
  "conversationId": "conv_jkl012",
  "eventType": "human_handoff.requested",
  "data": {
    "handoffId": "hho_mno345",
    "reason": "LOW_CONFIDENCE"
  }
}
```

- `tenantId` is always present (every `Event` is tenant-scoped).
- `businessId`, `customerId`, `conversationId` are present when the triggering event has
  them and `null`/omitted when it doesn't (e.g. `integration.connected` has no
  conversation at all) — a workflow that only cares about conversation-scoped events
  should guard on `conversationId` being present rather than assuming it always is.
- `eventType` is one of the `EVENT_TYPES` values — always present, always a string, safe
  to `switch`/`IF`-node on inside n8n.
- `data` holds the event-specific payload (unstructured beyond "valid JSON," same as
  `Event.payload` in the schema) — its shape depends on `eventType` (a
  `human_handoff.requested` payload looks different from an `action.executed` payload).

## Principle: n8n is orchestration, not source of truth

Core business logic, data validation, and permission checks never live inside an n8n
workflow. Concretely:

- A workflow node never writes directly to AI Employee's database — if it needs to
  change tenant data (mark a handoff resolved, update a customer record), it calls back
  through AI Employee's own authenticated API, which re-applies the same tenant
  isolation and RBAC checks as any other caller
  ([`docs/architecture.md`](architecture.md#multi-tenancy)). n8n workflows carry no
  special trust.
- A workflow node never decides business rules on AI Employee's behalf (e.g. "is this
  customer eligible for X") — that decision already happened before the triggering
  event was emitted; the workflow only reacts to the outcome.
- n8n being down, slow, or misconfigured never blocks the core conversation pipeline —
  triggering a workflow is fire-and-forget from the perspective of the event emitter.
  This mirrors the top-level product principle that AI Employee itself must be an
  optional add-on an external system can run without
  ([`docs/architecture.md`](architecture.md#vision)); the same "must not be a hard
  dependency" property applies one level down between AI Employee's core pipeline and
  n8n.

## Worked example

[`n8n/workflows/example-new-customer-lead.json`](../n8n/workflows/example-new-customer-lead.json)
is the reference example: triggered on a new-customer/lead-style event (e.g.
`customer.created`), it receives the standard envelope above and fans out to two
downstream steps — creating a contact in a CRM and posting a Slack/email notification —
using only the `tenantId`/`customerId`/`data` fields from the payload. It deliberately
contains no "is this a qualified lead" logic; that judgment already happened inside AI
Employee (or the external business system) before the event was ever emitted. Use it as
the template shape for new workflows: trigger node reads the envelope → branch on
whatever `data` fields matter → call out to third-party nodes/AI Employee's API as
needed → (optionally) report status back.

## Local configuration

n8n runs via `docker-compose.yml`'s `n8n` service (sqlite-backed for local dev, basic
auth via `N8N_BASIC_AUTH_USER`/`N8N_BASIC_AUTH_PASSWORD`), reachable at
`http://${N8N_HOST}:${N8N_PORT}` (default `http://localhost:5678`). `apps/api` talks to
it via `N8N_API_URL`/`N8N_API_KEY` (REST API, for triggering/polling) and
`N8N_WEBHOOK_URL` (for webhook-trigger-style workflows); all four are declared in
[`.env.example`](../.env.example). Workflow JSON files under `./n8n/workflows` are
mounted into the container at `/home/node/workflows` for import/reference.

## Related

- [`docs/multi-agent-architecture.md`](multi-agent-architecture.md) — the
  `human_handoff.requested`/`.completed` events most commonly wired to n8n alerts.
- [`docs/database-schema.md`](database-schema.md#n8n-workflows--workflow-workflowexecution) —
  `Workflow`/`WorkflowExecution`/`Event` table details.
- [`docs/integration-api-contract.md`](integration-api-contract.md) — the contract a
  workflow uses if it needs to call back into an external business system directly.
