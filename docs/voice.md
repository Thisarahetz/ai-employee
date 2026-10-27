# Voice calls

A customer phones the business's Twilio number and talks to the same AI employee that answers chat. Built on Twilio **ConversationRelay**: Twilio does speech-to-text and text-to-speech, and talks to the API in plain text over a WebSocket. There is no audio code in this repo.

```
caller ─▶ Twilio number ─▶ POST /webhooks/voice/twilio/incoming/:channelId   (signature checked)
                              └─ TwiML: <Connect><ConversationRelay url=wss://…/voice/stream>
Twilio STT ─▶ WebSocket /voice/stream ─▶ ConversationService.ingestInboundMessage
                                          └─ the normal reply pipeline (below)
reply ─▶ ResponseService ─▶ ChannelRegistry (VOICE) ─▶ VoiceSessionRegistry ─▶ {"type":"text"} ─▶ Twilio TTS ─▶ caller
```

## The reply pipeline is the existing one

A spoken turn is a chat message. Nothing about routing is voice-specific:

| Step in the call flow | What does it |
|---|---|
| Rasa classifies intent and entities | `NluService` (see [rasa-nlu.md](rasa-nlu.md)) |
| Known workflow → the right NestJS service | the knowledge / booking / support agents and their tools, chosen by Rasa |
| Real data or an authorized operation | the agents' tools (`ai-tools`), which enforce tenant and permission checks |
| Saved answers, reply modes (Hybrid / No-AI / AI) | `AgentOrchestratorService` |
| Low Rasa confidence or complex request → LLM | the existing router LLM fallback |
| Cannot be completed safely | one spoken clarification, then a staff handoff |
| Natural, concise speech | agents get a "phone call" prompt rule; `toSpeech()` strips markdown, links, emoji and long text |

Voice-only behaviour: the first time the router cannot place what was said, the caller is asked to repeat it (speech is often misheard) instead of being handed to staff at once. A second miss is a handoff.

## Setup

1. In the dashboard: **Channels → Add channel → Phone calls (Twilio)**. On the channel page you can set (all optional; API equivalent is `config`):
   `transferNumber` (E.164, where handoffs are transferred), `greeting`, `voice`, `ttsProvider`, `transcriptionProvider`.
2. Paste the Twilio auth token into **Twilio auth token** on the channel page (stored encrypted as the channel's `BEARER_TOKEN` credential). `TWILIO_AUTH_TOKEN` in the env is the single-business fallback. In production an unsigned request is rejected.
3. In Twilio, set the number's **A call comes in** webhook to `POST {API_URL}/webhooks/voice/twilio/incoming/<channelId>` (the channel page shows it with a copy button).
4. `API_URL` must be the public HTTPS URL; Twilio signs requests against it. `WEBHOOK_SIGNING_SECRET` signs the stream token.

## Handoff to a person

When a reply is a handoff (the caller asked for a person, or two misses), the reply is spoken, the session ends, and Twilio calls `…/action/:channelId`:

- `transferNumber` set → `<Dial>` to it.
- no number → the caller is told someone will get back to them, then the call ends. The handoff and the conversation stay open for staff.
- the stream failed → `<Dial>` to `transferNumber` if set, so a caller is never dropped on a broken session.

## Security

- Webhooks: `X-Twilio-Signature` (HMAC-SHA1) checked with that channel's own token. The channel id picks the business; one business's token cannot sign for another's channel.
- WebSocket: the webhook issues a 2-minute HMAC token bound to the channel; the first frame (`setup`) must return it or the socket is closed. A connection that sends nothing is closed after 5 s.
- Withheld caller numbers are treated as a new customer per call.
- Caps: `VOICE_MAX_CALLS` concurrent sockets, 64 KB per frame, 1000 characters per utterance.

## Languages

English and Sinhala. The call starts in the business's default language (`en-US` / `si-LK`); when the conversation language changes, a `language` message switches Twilio's speech language before the reply is spoken. Singlish is spoken as English. Sinhala speech-to-text and text-to-speech quality depends on the provider; set `VOICE_LANG_SI`, `VOICE_TTS_PROVIDER`, `VOICE_STT_PROVIDER` and `voice` to what your Twilio account supports.

## Limits

- Sessions live in the memory of one API process. Run a single API instance for voice, or route a caller's socket and replies to the same instance.
- Twilio sends no "finished speaking" signal, so a handoff ends the session after an estimated speaking time (`VOICE_HANDOFF_END_DELAY_MS` overrides).
- Caller barge-in is handled by Twilio (`interruptible`); a reply being generated when the caller interrupts is still spoken.

## Tests

`apps/api/test/voice.test.ts` (signature, token, protocol, speech clean-up) and `test/integration/voice.test.ts` (a real WebSocket call through the app: webhook, Rasa-first, LLM fallback, clarification, transfer, callback, Sinhala, forged tokens, timeout). Twilio itself is not called; verify end to end with a real number before launch.
