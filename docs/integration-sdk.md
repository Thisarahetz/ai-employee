# Integration SDK

Design and usage reference for [`packages/integration-sdk`](../packages/integration-sdk)
(owned by the integration-layer workstream) — a TypeScript/Node package that lets an
existing Express or NestJS system become AI-Employee-compatible by calling
`registerAction()` a few times, instead of hand-implementing the two-endpoint contract
described in [`docs/integration-api-contract.md`](integration-api-contract.md). Read
that doc first; this one assumes its contract as given and only covers the SDK layer on
top of it.

This package is a convenience, not the interoperability boundary — the contract is. Any
system in any language can implement `GET /ai/actions` / `POST /ai/execute` by hand and
be exactly as compatible as an SDK user. See "Other-language SDKs" at the bottom.

## Core concept: `registerAction()`

```ts
registerAction({
  name: 'create_booking',
  description: 'Create a new appointment booking for a customer.',
  parameters: {
    customerName: { type: 'string', description: 'Full name of the customer', required: true },
    serviceId: { type: 'string', description: 'ID of the requested service', required: true },
    startTime: { type: 'string', description: 'ISO 8601 start time', required: true },
    notes: { type: 'string', description: 'Optional notes', required: false },
  },
  handler: async (data, ctx) => {
    // data is already validated against the parameters schema above
    const booking = await bookingService.create(data);
    return { bookingId: booking.id, status: booking.status };
  },
});
```

- `name`, `description`, and `parameters` are exactly `ActionDefinitionDto`'s shape
  (`packages/types/src/integration-contract.ts`) — what you pass here is *verbatim* what
  `GET /ai/actions` returns for this action, so there's only one place to keep in sync.
- `handler` receives `data` already validated/coerced against `parameters`, plus a
  `ctx` object (request metadata: the `Idempotency-Key`, raw headers, whatever the auth
  verifier attached). Its return value becomes `ExecuteActionResponse.data` on success.
  A handler can also return `{ success: false, message }` directly (or throw a
  recognized SDK error) for a handled business failure — e.g. "serviceId not found" —
  without that being treated as a 500.
- Handlers are typically registered once, at application bootstrap, so `GET /ai/actions`
  is always exactly in sync with deployed code — there's no separate "publish your
  actions" step to forget.

## What the SDK builds under the hood: a framework-agnostic registry

Every `registerAction()` call adds to an in-memory action registry. That registry alone
is enough to answer both endpoints:

- `GET /ai/actions` → serialize every registered action's `{ name, description,
  parameters }` into `DiscoverActionsResponse`.
- `POST /ai/execute` → look up `action` by name, validate `data` against its
  `parameters` schema (rejecting with `{ success: false }` *before* calling the handler
  if validation fails — handler authors never re-implement parameter validation),
  invoke the handler, and wrap the result as `ExecuteActionResponse`.

The registry itself has no dependency on Express or NestJS — it's the adapters below
that mount it onto a real HTTP surface, which is what keeps behavior identical
regardless of which framework a given external system happens to use.

## Adapters

- **Express adapter** — `createExpressAiRouter(registry, options)` returns an Express
  `Router` exposing `GET /ai/actions` and `POST /ai/execute`, mountable onto an existing
  app (`app.use('/ai', createExpressAiRouter(registry))`).
- **NestJS adapter** — a module (`AiActionsModule.forRoot({ registry, ... })`) that
  registers the same two routes as NestJS controllers, for systems already built on
  Nest. A decorator-based alternative (`@AiAction()` on a provider method, discovered at
  bootstrap instead of an explicit `registerAction()` call) is a natural follow-up if
  the explicit-registration style feels too manual for larger Nest codebases — not a
  hard requirement, since explicit registration alone is enough to satisfy the contract.

Both adapters share:

- **Auth verification hook** — a pluggable function the adapter calls per-request to
  verify the caller (matching whichever `CredentialType` the integration owner chose —
  API key / bearer / basic / OAuth2, see `docs/integration-api-contract.md`'s auth
  table). The SDK doesn't prescribe *how* you store or check credentials, only the hook
  shape (`(req) => boolean | Promise<boolean>`), so it never forces a particular auth
  storage decision onto the host system.
- **Idempotency store hook** — an optional pluggable interface
  (`get(key)`/`set(key, response)`) for deduplicating `POST /ai/execute` calls by
  `Idempotency-Key`, per `docs/integration-api-contract.md`'s idempotency guidance. Ships
  with an in-memory default suitable for local development/single-instance deployments;
  production/multi-instance hosts should plug in a Redis- or DB-backed store so
  idempotency actually holds across process restarts and horizontal scaling.

## Validation

Parameter validation happens once, centrally, from the same `ActionParameterSchema`
data used for discovery — a required field missing, or a wrong basic type, is rejected
with a `success: false` `ExecuteActionResponse` before the handler ever runs. This
keeps the contract's guarantee ("what `GET /ai/actions` describes is what
`POST /ai/execute` actually enforces") true by construction rather than by each handler
author remembering to re-validate.

## Other-language SDKs

Nothing about the contract is TypeScript- or Node-specific. A Python (Flask/FastAPI),
PHP (Laravel/Symfony), Ruby, or Go SDK — or no SDK at all — can implement exactly the
same `GET /ai/actions` / `POST /ai/execute` pair described in
[`docs/integration-api-contract.md`](integration-api-contract.md) and be fully
AI-Employee-compatible. If/when a second-language SDK is built, it should mirror this
package's shape (a `register_action`-equivalent, a framework adapter, pluggable auth +
idempotency hooks) for consistency, but that's a design preference, not a requirement —
the JSON contract is the only thing AI Employee actually depends on.

## Where this fits

- **Package**: `packages/integration-sdk`, owned by the integration-layer workstream.
- **Consumers**: any external Node/Express/NestJS business system wanting the fastest
  path to compatibility; also useful for AI Employee's own example/demo integrations
  used in local development and docs.
- **Related**: [`docs/integration-api-contract.md`](integration-api-contract.md) (the
  contract this SDK implements), [`packages/types/src/integration-contract.ts`](../packages/types/src/integration-contract.ts)
  (the shared types), [`docs/n8n-architecture.md`](n8n-architecture.md) (a different,
  complementary integration path for automation rather than synchronous actions).
