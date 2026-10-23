# Reply engine: answers without an AI provider

Customer replies (website chat, WhatsApp) no longer have to go through an AI
provider. Each business picks a **reply mode**, and **saved answers** written by
the owner are matched without AI in English, Sinhala and Singlish.

## Reply modes

| Mode | What happens | AI cost |
|---|---|---|
| **Hybrid** (default) | Greetings, thanks and saved answers are sent instantly. AI answers only what they don't cover, using close saved answers as approved facts. | Low |
| **No AI** | Never calls an AI provider. Saved answers reply; anything else goes to staff and is kept as a question to answer. | None |
| **AI** | AI writes every reply (original behaviour), still given close saved answers as approved facts. | Highest |

- The owner (or an admin with `ai:configure`) picks the mode in **Settings → Customer replies**.
- The platform admin decides which modes each plan allows in **Admin → Subscriptions & Plans** (`PlanSettings`). Trial businesses follow the Free plan.
- If the chosen mode isn't allowed by the plan, the first allowed of Hybrid → No AI → AI is used, and Settings says so.

## How a message is answered

`apps/api/src/modules/ai-agent/agent-orchestrator.service.ts`

1. Staff have taken over the chat (`HUMAN_HANDLING`) → no automatic reply.
2. Customer asks for a person → staff handoff (every mode, no AI).
3. Hybrid / No AI: greeting or thanks only → fixed reply with the business name.
4. Hybrid / No AI: saved answer scores ≥ 0.70 → sent in the customer's language.
   - Hybrid skips this for booking-type requests ("book", "cancel", "වෙන් කරන්න", "appointment ekak") — they need the AI's tools.
   - Hybrid with the customer's language not written → AI writes it, using the saved answer as the facts.
5. No AI and nothing fits → staff handoff + "a team member will reply", question saved as a suggestion.
6. AI budget used up (daily/monthly limits) → saved answer if one fits, else staff. No AI call.
7. Otherwise → the AI agents, with saved answers scoring ≥ 0.35 given as approved facts.
8. AI error → saved answer if one fits, else staff with an apology.

While a handoff is waiting, follow-up messages don't repeat "a team member will reply".

Every automatic reply stores `metadata.replySource`: `saved_answer`, `template`, `ai` or `handoff`.

## Matching without AI

`apps/api/src/common/reply/answer-matcher.ts` — pure functions, unit tested in `apps/api/test/answer-matcher.test.ts`.

- Normalises text (case, punctuation, emoji, Sinhala zero-width joiners) and drops filler words in all three languages ("please", "da", "මට").
- Singlish/English sound-alike keys: `th→t`, `w→v`, `c→k`, doubled letters, `ee→i` — so "kohomada" = "kohomadha", "thiyenne" = "tiyenne".
- Word match allows: one typo (two for long words, first letter must agree), word endings ("price/prices", "මිල/මිලද"), and Singlish without vowels ("krnne" = "karanne").
- Score = 55% how much of the saved question is in the message + 25% how much of the message is about it + 20% character similarity.

Tune with `DIRECT_MATCH_SCORE` (0.70) and `HINT_MATCH_SCORE` (0.35).

## Learning loop

- **Questions to answer**: unanswered questions become `SUGGESTED` saved answers, grouped by similarity with a count. The owner writes the answer once.
- **Save as answer**: any AI or staff reply in a conversation can become a saved answer, pre-filled with the customer's question.
- **Try a customer question** on the Saved Answers page shows exactly what a customer would get.

## Other resilience

- Business-info search falls back to Postgres keyword search when the embedding provider fails (`RagService.keywordSearch`).

## API

| Method | Path | Permission |
|---|---|---|
| GET | `/saved-answers?status=ACTIVE\|SUGGESTED\|DISABLED` | `conversations:read` |
| POST | `/saved-answers` | `ai:configure` |
| PATCH / DELETE | `/saved-answers/:id` | `ai:configure` |
| POST | `/saved-answers/test` `{ message, language }` | `conversations:read` |
| GET | `/saved-answers/stats?days=30` | `conversations:read` |
| GET / PATCH | `/reply-settings` `{ mode }` | `tenant:read` / `ai:configure` |
| GET | `/admin/plans` (now includes `allowedReplyModes`) | platform admin |
| PATCH | `/admin/plans/:id/reply-modes` `{ allowedReplyModes }` | platform admin, audited |

## Deploying

- Migration `20261024090000_reply_engine` is additive. Existing businesses become **Hybrid**: with no saved answers yet, the only change customers see is that greetings and "thanks" get a fixed reply instead of an AI one.
- Saved answers are cached per server for 30 seconds; edits on the same server apply at once, other servers within 30 seconds.
- Tests: `apps/api/test/answer-matcher.test.ts`, `apps/api/test/integration/reply-engine.test.ts`, `apps/web/e2e/saved-answers.spec.ts`.
