# Integration API Contract

The generic contract any external business system implements so AI Employee can
discover and execute actions against it. AI Employee has no business-specific logic
built in ([`docs/architecture.md`](architecture.md#vision)) — this small HTTP contract
(two required endpoints, plus an optional `GET /ai/knowledge`) is the entire surface
area an external system needs to expose to become "AI-Employee-compatible." The
corresponding TypeScript types live in
[`packages/types/src/integration-contract.ts`](../packages/types/src/integration-contract.ts)
and are the source of truth for field names/shapes; this doc gives the narrative +
worked JSON examples.

Server-side, this contract is consumed by `apps/api/src/modules/external-action`
(discovering and invoking actions on behalf of the Action Agent — see
[`docs/multi-agent-architecture.md`](multi-agent-architecture.md#action-agent)) and
persisted via the `Integration` / `IntegrationCredential` / `IntegrationAction` models
(see [`docs/database-schema.md`](database-schema.md#integrations--integration-integrationcredential-integrationaction)).

## `GET /ai/actions` — discovery

Called by AI Employee to (re)populate a tenant's `IntegrationAction` catalogue. Should
be cheap and side-effect-free — it's expected to be polled periodically, not just once
at setup.

**Request**: no body. Authenticated per the integration's configured `CredentialType`
(see Authentication below).

**Response** (`200 OK`, shape: `DiscoverActionsResponse`):

```json
{
  "actions": [
    {
      "name": "create_booking",
      "description": "Create a new appointment booking for a customer.",
      "parameters": {
        "customerName": {
          "type": "string",
          "description": "Full name of the customer",
          "required": true
        },
        "serviceId": {
          "type": "string",
          "description": "ID of the requested service",
          "required": true
        },
        "startTime": {
          "type": "string",
          "description": "ISO 8601 start time for the appointment",
          "required": true
        },
        "notes": {
          "type": "string",
          "description": "Optional notes from the customer",
          "required": false
        }
      }
    },
    {
      "name": "cancel_booking",
      "description": "Cancel an existing appointment booking.",
      "parameters": {
        "bookingId": {
          "type": "string",
          "description": "ID of the booking to cancel",
          "required": true
        }
      }
    }
  ]
}
```

Each entry in `actions` matches `ActionDefinitionDto`: `name` (stable identifier, used
verbatim as `ExecuteActionRequest.action`), `description` (fed to the model — write it
for an LLM reader, not a human skimming docs), and `parameters` — a map of parameter
name to `ActionParameterSchema` (`type`, `description`, `required`, and optionally
`enum`, `items`, `properties`, `default` for richer JSON-schema-like shapes). AI
Employee upserts each returned action into `IntegrationAction` keyed on
`(integrationId, name)` and stamps `lastDiscoveredAt`; actions no longer returned are
left in place but should be marked/disabled by the integration owner rather than
silently vanishing (an in-flight conversation may still reference one).

## `POST /ai/execute` — execution

Called by the Action Agent when the model decides to invoke a tool.

**Request headers**: same auth as `GET /ai/actions`, plus:

```
Idempotency-Key: 3f29a1c2-9e3b-4b7e-9c2e-1a2b3c4d5e6f
Content-Type: application/json
```

**Request body** (shape: `ExecuteActionRequest`):

```json
{
  "action": "create_booking",
  "data": {
    "customerName": "Jane Doe",
    "serviceId": "svc_123",
    "startTime": "2026-08-25T10:00:00Z",
    "notes": "Prefers a window seat"
  }
}
```

**Response — success** (`200 OK`, shape: `ExecuteActionResponse`):

```json
{
  "success": true,
  "message": "Booking created successfully",
  "data": {
    "bookingId": "bk_789",
    "status": "confirmed"
  }
}
```

**Response — failure** (still `200 OK` — use the envelope, not just HTTP status, so the
Action Agent gets a `message` it can relay or reason about; reserve non-2xx for
transport/auth-level failures):

```json
{
  "success": false,
  "message": "serviceId svc_123 not found",
  "data": null
}
```

`data` is intentionally `unknown`/free-form on the response — it's whatever shape makes
sense for that action's result and is not validated by AI Employee beyond being JSON.

## `GET /ai/knowledge` — reference-data sync (optional)

`GET /ai/actions` / `POST /ai/execute` let the **Action Agent** *do things*. `GET
/ai/knowledge` is the complementary read path for the **Knowledge Agent** (see
[`docs/multi-agent-architecture.md`](multi-agent-architecture.md#knowledge-agent)):
it returns the reference material a customer asks *about* but that doesn't require an
action — services & pricing, locations & opening hours, policies, FAQs. One document
per topic (they're chunked and retrieved independently), each with a stable `externalId`.

AI Employee pulls this feed when the operator clicks **"Sync knowledge base"** on the
integration (`POST /integrations/:id/knowledge/sync`) and, on each sync:

- **`documents`** → chunked + embedded into a dedicated `KnowledgeBase` auto-named
  `"<integration> (synced)"`, **upserting each on its `externalId`** and deleting any
  the feed no longer returns.
- **`locations`** (optional) → mirrored into `Business` (Location) records, **upserting
  each on its `externalId`** (adopting an existing unlinked Location with the same name
  on the first sync). Locations dropped from the feed are **left in place, never
  deleted** — they may already have channels and conversations attached.

This endpoint is optional: a `404` is read as "this integration has no knowledge feed"
and the sync is a no-op.

**Request**: no body. Same auth as `GET /ai/actions`. Should be cheap and
side-effect-free.

**Response** (`200 OK`, shape: `SyncKnowledgeResponse`):

```json
{
  "documents": [
    {
      "externalId": "services-and-pricing",
      "title": "Services & Pricing",
      "format": "markdown",
      "content": "## Haircut\n\n- **Standard** — $25.00 (30 min)\n\n## Beard Trim\n\n- **Standard** — $15.00 (15 min)\n"
    },
    {
      "externalId": "locations-and-hours",
      "title": "Locations & Opening Hours",
      "format": "text",
      "content": "Main Salon — 123 Fifth Avenue, New York. Mon–Fri 9am–7pm, Sat 10am–5pm, closed Sunday.\nWest Coast Studio — 456 Sunset Blvd, Los Angeles. Tue–Sat 10am–8pm, closed Sun–Mon."
    }
  ],
  "locations": [
    {
      "externalId": "loc-1",
      "name": "Main Salon",
      "timezone": "America/New_York",
      "address": "123 Fifth Avenue, New York, US",
      "phone": "+1-555-0100"
    },
    {
      "externalId": "loc-2",
      "name": "West Coast Studio",
      "timezone": "America/Los_Angeles",
      "address": "456 Sunset Blvd, Los Angeles, US",
      "phone": "+1-555-0200"
    }
  ]
}
```

Each `documents` entry matches `KnowledgeDocumentDto`: `externalId` (stable per-document
id, the upsert key — keep it constant across syncs for the same logical document),
`title` (shown in the Knowledge Base UI), `content` (the text that actually gets
chunked, embedded and retrieved — write it for retrieval, not layout), and optional
`format` (`"text"` | `"markdown"`, default `"text"`).

Each `locations` entry matches `KnowledgeLocationDto`: `externalId` (upsert key),
`name` (mirrored verbatim onto the Location record), and optional `timezone` (IANA),
`address` (one line), `phone`. Include a `locations-and-hours` **document** too if you
want the Knowledge Agent to *answer* address/hours questions — the `locations` array
drives the Location records, not RAG retrieval.

Return the *whole* current set on every call; AI Employee diffs it against what it
synced last time. Keep document `content` self-contained and phrased the way a customer
would ask ("A standard haircut is $25 and takes about 30 minutes") — the Knowledge
Agent answers from these chunks verbatim-ish, so a bare price table with no labels
retrieves poorly.

## Idempotency

AI Employee generates one `Idempotency-Key` per *logical* action attempt (not per HTTP
retry) and resends the **same** key if it has to retry the call after a timeout or
transport error. External systems implementing this contract should:

1. On receiving a request with an `Idempotency-Key` they've seen before (within a
   reasonable retention window — 24h is a sane default), return the **same response**
   they returned the first time, without re-executing the action.
2. Key storage should be scoped at least per-integration (per-tenant, effectively,
   since one `Integration` belongs to one tenant) to avoid any cross-tenant collision.
3. If the first attempt is still in flight when a duplicate arrives, either block until
   it completes or reject with a clear `success: false` — never run the action a second
   time concurrently.

This matters for cost as well as correctness: a duplicate booking or duplicate charge is
bad on its own, and cleaning it up conversationally burns extra, avoidable LLM calls
(see [`docs/token-optimization-strategy.md`](token-optimization-strategy.md), Rule 13).
`apps/api/src/modules/external-action` owns generating/propagating the header on AI
Employee's side.

## Authentication

`Integration.type` and the stored `IntegrationCredential.type` (`CredentialType` enum)
determine how AI Employee authenticates its calls to `GET /ai/actions` /
`POST /ai/execute`:

| `CredentialType` | How AI Employee sends it | Notes |
|---|---|---|
| `API_KEY` | A header agreed in `Integration.config` (commonly `X-API-Key: <key>`) | Simplest option; rotate by issuing a new key and updating the stored credential. |
| `BEARER_TOKEN` | `Authorization: Bearer <token>` | Static, long-lived token — simple, but has no built-in rotation/expiry story. |
| `BASIC_AUTH` | `Authorization: Basic base64(username:password)` | Mainly for systems that only support this out of the box. |
| `OAUTH2` | `Authorization: Bearer <access_token>` | AI Employee (or the integration's config) handles the token refresh flow; the external system just validates the bearer token like any OAuth2 resource server. |

Whichever type is used, the secret itself is stored once, AES-encrypted, in
`IntegrationCredential.encryptedPayload` (see `CREDENTIALS_ENCRYPTION_KEY` in
`.env.example`) and is never returned by any AI Employee API — the "public" shape of a
credential (see `packages/types/src/entities.ts`) omits the payload entirely.

## Webhooks — pushing business events to AI Employee

Your system tells AI Employee what happened (a booking was cancelled, an order was
refunded) by POSTing events. Automation rules turn those events into work for AI
employees, e.g. "when `appointment.cancelled`, have the receptionist offer a new slot".

**Endpoint**: `POST /webhooks/{integrationId}` (returns `202 Accepted`).

**Secret**: each integration has its own secret, shown once when the integration is
created (`webhookSecret` in the create response) and re-issued by
`POST /integrations/{id}/webhook-secret`. Rotating it invalidates the old one at once.

**Signing** (required):

```
X-Timestamp: <unix seconds>
X-Signature: hex( HMAC-SHA256( secret, "<X-Timestamp>.<raw request body>" ) )
```

Sign the exact bytes you send. Requests more than 5 minutes from the server's clock are
rejected, so a captured request can't be replayed later.

**Body**:

```json
{
  "event": "appointment.cancelled",
  "appointmentId": "apt_123",
  "customerId": "cus_456",
  "customerName": "Nadeesha Perera",
  "service": "Haircut & Blowdry",
  "startsAt": "2026-10-24T04:30:00Z",
  "staffName": "Kasun",
  "reason": "sick"
}
```

- `event` must look like `noun.verb` (lowercase, 2–4 dot-separated parts). Platform-internal
  names are reserved and rejected: `message.*`, `conversation.*`, `human_handoff.*`,
  `action.*`, `integration.*`, `saga.*`, `invariant.*`, `ai_*`, `system.*`, `platform.*`.
- The tenant is always the integration's owner. A `tenantId` field in the body is ignored.
- Every other field is available to automation rules as `{{field}}` placeholders and
  conditions. The built-in industry templates use these fields:

| Event | Fields used |
|---|---|
| `appointment.created` / `appointment.completed` / `appointment.cancelled` | `appointmentId`, `customerId`, `customerName`, `service`, `startsAt`, `staffName`, `reason` |
| `lead.created` | `customerId`, `name`, `email`, `phone`, `interest` |
| any `order.*` / `booking.*` / `payment.*` you define | whatever you send |

Event data is passed to the AI as untrusted information (never as instructions), so free
text from customers can't take control of an AI employee.

## How to make your existing system AI-Employee-compatible

1. **Implement `GET /ai/actions`** returning the actions you want AI Employee's Action
   Agent to be able to call, in the shape above. This is a pure read — no new business
   logic, just a description of business logic you already have.
2. **Implement `POST /ai/execute`** dispatching `action`/`data` to your existing
   internal functions/services. Validate `data` against the parameter schema you
   advertised, execute, and return the envelope. Respect `Idempotency-Key` as described
   above.
3. **Pick an auth method** from the table, generate a credential, and register the
   integration in AI Employee (`Integration` + `IntegrationCredential`, via
   `apps/api/src/modules/integration`).
4. AI Employee calls `GET /ai/actions` to populate `IntegrationAction` rows, and from
   then on the Action Agent can call `POST /ai/execute` whenever a customer's request
   maps to one of your actions.
5. **Optionally implement `GET /ai/knowledge`** returning your reference data (services
   & pricing, hours, policies) so the Knowledge Agent can answer questions *about* the
   business, not just *act* on it. Another pure read; skip it and those questions fall
   back to whatever documents the operator uploaded by hand.
6. **If you're on Node/Express/NestJS**, skip steps 1–2 and 5 by using
   [`packages/integration-sdk`](../packages/integration-sdk) — see
   [`docs/integration-sdk.md`](integration-sdk.md) — and just call `registerAction()`
   for each capability and `registerKnowledge()` for the reference feed; the SDK
   exposes all three endpoints for you. **Any other language** (Python, PHP, Ruby, Go,
   ...) can implement the same JSON endpoints directly from this document with no
   dependency on AI Employee code at all — the contract, not any SDK, is the actual
   interoperability boundary.
