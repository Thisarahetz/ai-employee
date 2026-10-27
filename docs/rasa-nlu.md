# Rasa-first message routing

Rasa (NLU only) reads each customer message first. If it clearly recognises a
supported request, the existing agent for it is chosen **without the router LLM
call**. Everything else goes to the existing LLM router exactly as before.

```
customer message (website chat / WhatsApp)  →  tenant + conversation + permissions (existing)
  │
  ├─ staff already handling the chat → no automatic reply            (existing)
  ├─ explicit "talk to a person" pattern → staff handoff             (existing, no AI)
  ├─ Hybrid / No-AI: strict greeting/thanks pattern → fixed reply    (existing)
  │
  ├─ Rasa  POST /model/parse  (1.5 s timeout, no retry, circuit breaker)
  │     intent + confidence + runner-up
  │
  ├─ policy (apps/api/src/modules/nlu/nlu-policy.ts)
  │     greeting/thanks/goodbye, short message, Hybrid/No-AI → fixed reply, no LLM
  │     ask_* intents                 → knowledge agent (+ fixed English search words)
  │     book / availability / lookup  → action agent
  │     cancel / reschedule           → action agent only at ≥ 0.92 (RASA_HIGH_RISK_CONFIDENCE)
  │     request_human                 → never by Rasa alone → LLM router decides
  │     yes / no                      → action agent only inside a booking, else LLM router
  │     out_of_scope / unknown / low / medium confidence / close runner-up → LLM router
  │     Rasa off, down, slow or malformed → LLM router
  │
  └─ the chosen agent runs exactly as before (saved answers, RAG, tools, approvals)
```

Both Rasa and the LLM down: the existing pipeline-error path hands the customer
to staff with a clear message (tested).

## What Rasa does and does not decide

Rasa only picks **who handles the turn**. It never executes a tool, never reads
tenant data and never receives tenant or user identifiers, only the message
text. Tool execution, permissions, tenant scoping and approvals stay in the
agents. Confidence alone authorizes nothing: bookings are made only when the
action agent's tool call succeeds, as before.

## What is saved without the LLM

| Saves | When |
|---|---|
| The router LLM call (every message) | any supported intent at high confidence |
| The answer LLM call | greeting / thanks / goodbye in Hybrid and No-AI (a fixed reply) |
| The Sinhala→English search-translation call | `ask_*` intents (fixed English search words are used) |

Questions that need facts (hours, prices) or tools (bookings) still use the
knowledge or action agent, or a **saved answer** when one matches (existing,
unchanged). Rasa makes the routing cheaper; saved answers make the answering
free.

## Intent catalogue

Derived from what this product's agents can do (support, knowledge, booking):
`greeting thanks goodbye request_human affirm deny ask_business_hours ask_pricing
ask_location ask_services book_appointment check_availability cancel_appointment
reschedule_appointment lookup_booking out_of_scope`.

The example intents in the original brief (sales, orders, inventory, invoices,
customer details, business summary, agent status, stop task) have **no
customer-facing handler in this app**; they are trained as `out_of_scope` so
they go to the LLM instead of being mistaken for pricing questions.

## Settings (environment)

| Variable | Default | Meaning |
|---|---|---|
| `RASA_BASE_URL` | – | Setting this turns Rasa on (each business then has its own checkbox in Settings → Customer replies) |
| `RASA_ENABLED` | on | Set `false` to switch Rasa off for the whole platform |
| `RASA_AUTH_TOKEN` | – | Shared secret (≥24 random chars, enforced in production) |
| `RASA_TIMEOUT_MS` | 1500 | Per call |
| `RASA_HIGH_CONFIDENCE` | 0.80 | Route without the router LLM |
| `RASA_HIGH_RISK_CONFIDENCE` | 0.92 | Cancel / reschedule |
| `RASA_LOW_CONFIDENCE` | 0.50 | Below: ignored. Between low and high: the LLM interprets |
| `RASA_MIN_MARGIN` | 0.15 | Needed gap to the second-best intent |
| `RASA_TEMPLATE_MAX_WORDS` | 6 | Longest message that gets a fixed greeting/thanks/goodbye |
| `RASA_BREAKER_FAILURES` / `RASA_BREAKER_COOLDOWN_MS` | 3 / 30000 | Skip Rasa for 30 s after 3 failures |

## Observability

- Every automatic reply stores `metadata.nlu = { path: 'rasa'|'llm', intent, confidence, reason, ms }`. No message text.
- `GET /nlu/stats?days=30` (permission `conversations:read`, per business): replies, share handled by Rasa, router calls avoided, intents, fallback reasons, average confidence and latency per path, plus per-process counters (requests, Rasa errors).
- Fallback reasons: `disabled rasa_unavailable unsupported_intent low_confidence medium_confidence ambiguous sensitive_intent context_required long_message`.
- Logs (`nlu_route`, `rasa_unavailable`, `rasa_circuit_open`) carry intent, score, route and timing, never text.
- LLM spend stays in the existing AI usage logs; compare it before and after enabling Rasa, together with `routerCallsAvoided`.

## Measured quality (held-out phrases, `rasa/results/evaluation-2026-10-27.txt`)

147 phrases never used in training (English, Sinhala script, Singlish; 22 out of scope):

- 85% handled by Rasa; 99% of in-scope messages (124/125).
- 143/147 correct routing overall (97%), counting out-of-scope → LLM as correct.
- **3 wrongly routed (2.4% of handled)**: a Sinhala "goodbye" answered as a greeting, a Sinhala hair-straightening question that got the fixed *goodbye* reply (a short message at 0.81), and one out-of-scope Singlish question sent to the knowledge agent, which answers "I don't have that". None can trigger a tool or action, but the second one is a real customer-visible mistake; the fix is more Sinhala `ask_services` examples, and raising `RASA_HIGH_CONFIDENCE` to 0.85 would also have caught it.

Honest limits:
- The test set is small and was used while iterating on training data, so treat the numbers as optimistic. Re-measure on real, privacy-reviewed customer messages (see `rasa/README.md`) before relying on them.
- The classifier is over-confident (wrong answers also score 0.8–1.0), so thresholds alone cannot make it safe. Safety comes from the policy above: Rasa can only pick an agent, and risky intents are never decided by it.
- Spelling variants of Singlish are covered by character n-grams, but unseen slang falls to `out_of_scope`/low confidence and goes to the LLM, which is the safe direction.

## Rollout

1. `docker compose up -d --build rasa` (or `./start.sh`).
2. Set `RASA_ENABLED=true`. Turn it off again at any time; nothing else changes.
3. Watch `/nlu/stats`: if `fallbackReasons` is dominated by `unsupported_intent`, add examples (`rasa/README.md`).
