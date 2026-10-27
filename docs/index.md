# AI Employee

A reusable, multi-tenant **AI Employee** platform: build it once, connect it to any business
system (salon, hotel, clinic, e-commerce, CRM, ERP or a custom app) through a generic
Integration Layer. It holds no business-specific logic; every connected system describes its
own actions, and AI Employee only requests them.

<div class="grid cards" markdown>

- :material-rocket-launch: **[Quick start](getting-started.md)**: run the API, dashboard and services locally.
- :material-forum: **[Customer channels](channels.md)**: WhatsApp, website chat, email and phone calls.
- :material-phone-in-talk: **[Phone calls](voice.md)**: Twilio voice with Rasa and an LLM fallback.
- :material-sitemap: **[Architecture](architecture.md)**: how a customer message becomes a reply.
- :material-api: **[Integration API](integration-api-contract.md)**: connect your own system.

</div>

## What it does

- **Answers customers** on every channel with the same pipeline: staff handoff, fixed replies,
  Rasa intent routing, owner-approved saved answers, then AI agents using real data.
- **Works without AI** when you want it to: Hybrid, No-AI and AI reply modes per plan.
- **Speaks English, Sinhala and Singlish**, with a Sinhala dashboard.
- **Runs background work** 24/7 with approvals, budgets, schedules and automations.
- **Isolates every business** (multi-tenant, per-branch access) and degrades safely: external
  systems keep working if AI Employee is offline.
