# Multi-Agent Architecture

How AI Employee routes a single inbound message through a small set of specialized
agents instead of one large agent with everything loaded at once, and how/when it
escalates to a human. See [`docs/architecture.md`](architecture.md#multi-agent-pipeline-see-docsmulti-agent-architecturemd)
for the one-paragraph summary and pipeline diagram this doc expands on, and
[`docs/token-optimization-strategy.md`](token-optimization-strategy.md) for the token-cost
reasoning behind the design choices here.

Ownership: this design is implemented in `apps/api/src/modules/ai-agent/*`
(orchestration, per-agent logic, handoff-trigger evaluation) and `packages/ai-core/*`
(the `AIProvider` abstraction over OpenAI/Anthropic, prompt construction, token
counting) — both owned by the AI-core agent workstream. `apps/api/src/modules/ai-tools`
bridges agent function-calling to `IntegrationAction` rows (owned by the same
workstream); `apps/api/src/modules/external-action` (owned by the integration-layer
workstream) is what an `ACTION`-agent tool call actually invokes. Conversation/message
persistence and human-handoff CRUD are core domain data owned by the backend-core
workstream (`apps/api/src/modules/conversation`); the *decision* to trigger a handoff is
made inside the agent logic described below.

## Why not one big agent

A single agent with the full conversation history, the entire knowledge base, and every
integration action loaded into context on every turn would be simple to build and very
expensive/slow to run at scale, and gets *worse* the more a tenant grows their knowledge
base and action catalogue — exactly the customers you want the product to work well for.
Instead, AI Employee splits the work into a cheap classification step plus a narrow,
purpose-built specialist, so each turn only pays for the context it actually needs.

## The four agent types (`AgentType` enum)

Each maps to one `AiAgent` row per tenant (`@@unique([tenantId, type])`) with its own
`AiConfiguration` (provider, model, temperature, maxTokens — see
`prisma/schema.prisma`), so a tenant can run a cheap model for `ROUTER` and a stronger
one for `ACTION` without any code change. (`HUMAN` is the fifth `AgentType` value but
isn't an AI agent at all — it's what `Conversation.currentAgent` is set to once a human
has taken over; see the handoff section below.)

### Router Agent

**Intent only.** Classifies the inbound message into one of `SUPPORT | KNOWLEDGE |
ACTION | HUMAN` (or "needs more of the same conversation" if already mid-flow with a
specialist) and does nothing else — it does not answer the customer.

- **Loads**: the latest customer message, plus a short window of recent conversation
  context (last few messages and/or the current `ConversationSummary`) — just enough to
  classify intent correctly on a follow-up message ("yes please" needs prior turns to
  mean anything).
- **Does NOT load**: knowledge base chunks, the integration action catalogue, or full
  conversation history. Classification doesn't need them, and loading them here would
  mean paying for that context on *every single turn* regardless of which specialist
  ultimately handles it.
- **Why cheap**: this runs on every inbound message with no exceptions, so it's the
  highest-volume call in the system — the natural place for the smallest/fastest model
  a tenant has configured (see Token Optimization Rule 1).

### Support Agent

General conversational handling — greetings, small talk, order/status questions
answerable from conversation context alone, anything that doesn't need document
retrieval or an external system call.

- **Loads**: recent messages + `ConversationSummary` (same context-window rules as
  everywhere else — see Rules 2 and 9), customer profile basics (`Customer.name`,
  `metadata`).
- **Does NOT load**: knowledge base chunks or the integration action catalogue. If mid-
  conversation it becomes clear the customer needs either, Support hands back to Router
  (or directly signals the orchestrator to re-route) rather than trying to do
  everything itself.

### Knowledge Agent

Answers questions that require retrieval from a tenant's documents (RAG).

- **Loads**: the top-K most relevant `DocumentChunk` rows for the query, retrieved via
  pgvector similarity search (see
  [`docs/database-schema.md`](database-schema.md#knowledge-base--rag--knowledgebase-document-documentchunk)
  for why that's raw SQL, not the Prisma query builder), plus the same recent-message
  context window as Support.
- **Does NOT load**: the full knowledge base (only the retrieved chunks), or the
  integration action catalogue. If the answer requires *acting* (e.g. "book that for
  me" after describing a service), it hands off to Action rather than trying to call
  external systems itself.
- Implemented against `apps/api/src/modules/knowledge-base` + `apps/api/src/modules/rag`.

### Action Agent

Executes external-system operations via the Integration Layer.

- **Loads**: the relevant subset of the tenant's `IntegrationAction` catalogue (filtered
  by `isEnabled` and, where possible, by intent — not the tenant's entire action list on
  every call, see Token Optimization Rule 6), exposed to the model as structured
  function-calling tools (`ActionDefinitionDto`/`ActionParameterSchema`, see
  [`docs/integration-api-contract.md`](integration-api-contract.md)) rather than a
  prose description of available actions.
- **Does NOT load**: knowledge base chunks.
- On a tool call, invokes `apps/api/src/modules/external-action`, which calls the
  external system's `POST /ai/execute` with an `Idempotency-Key`, and on success the
  orchestrator emits `action.executed`.

## Context-loading summary

| Agent     | Recent messages / summary | KB chunks (RAG) | Action catalogue | Notes |
|-----------|:---:|:---:|:---:|---|
| Router    | ✓ (short window) | ✗ | ✗ | classification only, runs every turn |
| Support   | ✓ | ✗ | ✗ | falls back to Router's routing if it can't help |
| Knowledge | ✓ | ✓ (top-K only) | ✗ | hands off to Action if the answer requires doing something |
| Action    | ✓ | ✗ | ✓ (filtered subset) | calls `external-action` module, may emit `action.executed` |

## Human handoff

`HumanHandoff` rows (`reason`: `HandoffReason`, `status`: `HandoffStatus`) are created
when any agent — most often Router (can't classify), Action (can't find a matching
action or the action fails repeatedly), or Knowledge (retrieval returns nothing usable)
— decides the AI cannot or should not continue. The five `HandoffReason` values and
their trigger conditions:

- **`CUSTOMER_REQUEST`** — the customer explicitly asks for a human ("talk to a
  person", "agent please"). Detected directly from message content, no model confidence
  involved — this one should basically never be gotten wrong.
- **`LOW_CONFIDENCE`** — the responding agent's own confidence in its answer/action
  falls below a configured threshold. Applies mainly to Support and Knowledge, where
  "confidently wrong" is worse than escalating.
- **`UNSUPPORTED_REQUEST`** — Router can't classify the intent into any of
  `SUPPORT | KNOWLEDGE | ACTION`, or Action can't find a matching `IntegrationAction`
  for what the customer is asking to do. This is the natural consequence of AI Employee
  having zero hardcoded business logic: if the external system hasn't exposed an action
  for it, AI Employee structurally cannot do it, and should say so via a human rather
  than guessing.
- **`SENSITIVE_REQUEST`** — the request touches a category a tenant has flagged as
  human-only (refunds/cancellations above a threshold, legal, health/medical specifics,
  complaints, anything a tenant's `AiAgent.systemPrompt`/config marks off-limits for
  autonomous handling).
- **`REPEATED_FAILURE`** — the same agent has failed to resolve the same request N times
  in a row within one conversation (e.g. Action's tool call keeps erroring, or Knowledge
  keeps failing to retrieve anything relevant) — a loop-breaker so the AI doesn't keep
  re-trying the same failing approach indefinitely.

On trigger: a `HumanHandoff` row is created (`status: PENDING`), the owning
`Conversation.status` moves to `HUMAN_HANDLING` and `currentAgent` to `HUMAN`, and a
`human_handoff.requested` event is emitted — which can fan out to a `Notification` for
available agents and/or an n8n workflow (e.g. a Slack/email alert; see
[`docs/n8n-architecture.md`](n8n-architecture.md)). When a human resolves it,
`HumanHandoff.status` moves to `RESOLVED`, `resolvedAt` is set, and
`human_handoff.completed` is emitted.

## Event-driven glue

The orchestration is event-driven end to end, not a single synchronous call stack, so
that channels, agents, and the integration layer stay decoupled:

1. A Channel Adapter (`packages/channel-sdk`) normalizes an inbound message and calls
   into the Conversation Service, which persists it as a `Message` (`sender:
   CUSTOMER`) and emits `message.received` (see `EVENT_TYPES` in
   [`packages/shared/src/constants/event-types.ts`](../packages/shared/src/constants/event-types.ts)),
   also persisted as an `Event` row.
2. `AgentOrchestratorService` (`apps/api/src/modules/ai-agent`) picks up
   `message.received`, loads the minimal context described above, and invokes the
   Router Agent.
3. Router returns a routing decision; the orchestrator invokes exactly one specialized
   agent (Support, Knowledge, or Action) with only that agent's required context.
4. If the specialized agent is Action and it calls a tool, the orchestrator goes through
   `external-action` to call the external system's `POST /ai/execute`; on success
   `action.executed` is emitted (and logged as an `Event`); on failure/uncertainty the
   agent may instead trigger a handoff as described above.
5. The specialized agent's reply is persisted as a `Message` (`sender: AI`,
   `agentType` set to whichever agent produced it) with an accompanying `AiUsageLog`
   row (tokens, cost, latency — see
   [`docs/token-optimization-strategy.md`](token-optimization-strategy.md) Rule 10), and
   handed back out through the Channel Adapter to the customer.
6. At any point a handoff may instead fire, per the triggers above, short-circuiting
   step 5 with a human-handoff flow instead of an AI reply.

Because every step is keyed off a persisted `Event`, the same pipeline is what n8n
workflows subscribe to for automation side-effects (reminders, CRM syncs, Slack
alerts) without that logic ever needing to live inside the agent code itself — see
[`docs/n8n-architecture.md`](n8n-architecture.md).
