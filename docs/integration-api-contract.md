# Integration API Contract

The generic contract any external business system implements so AI Employee can
discover and execute actions against it. AI Employee has no business-specific logic
built in ([`docs/architecture.md`](architecture.md#vision)) — this two-endpoint contract
is the entire surface area an external system needs to expose to become
"AI-Employee-compatible." The corresponding TypeScript types live in
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
5. **If you're on Node/Express/NestJS**, skip steps 1–2 by using
   [`packages/integration-sdk`](../packages/integration-sdk) — see
   [`docs/integration-sdk.md`](integration-sdk.md) — and just call `registerAction()`
   for each capability; the SDK exposes both endpoints for you. **Any other language**
   (Python, PHP, Ruby, Go, ...) can implement the same two JSON endpoints directly from
   this document with no dependency on AI Employee code at all — the contract, not any
   SDK, is the actual interoperability boundary.
