# Rasa NLU service

Intent classifier for customer messages (English, Sinhala script, Singlish).
NLU only: no dialogue policies, stories or action server; NestJS owns the
conversation. Design and routing rules: [`docs/rasa-nlu.md`](../docs/rasa-nlu.md).

| File | What |
|---|---|
| `config.yml` | Pipeline: whitespace tokens + word and character (1-4) n-grams → DIET → fallback. No English-only pretrained model, so Sinhala script and Latin-letter Singlish are handled alike. |
| `domain.yml` | Intent list |
| `data/nlu.yml` | Training examples, per intent in three languages |
| `tests/test_nlu.yml` | Held-out evaluation phrases (never copy these into training) |
| `scripts/evaluate.py` | Evaluates a running service with the same thresholds NestJS uses |
| `scripts/train.sh` | Train → evaluate → export a versioned model file |
| `Dockerfile` | `rasa/rasa:3.6.21` (pinned, multi-arch); trains at build time; model baked in |

## Run

```bash
docker compose up -d --build rasa          # or ./start.sh
docker compose ps rasa                     # should say healthy
curl -s -X POST "localhost:5005/model/parse?token=$RASA_AUTH_TOKEN" -d '{"text":"heta haircut ekak book karanna"}'
```

The port is bound to `127.0.0.1` and every call needs the token. Do not publish it publicly.

## Improve and redeploy the model

1. Add examples to `data/nlu.yml` (one line each). Use **approved, privacy-safe** sources only: the business's own suggested saved-answer questions and conversations the owner has approved, with names, phone numbers and addresses removed. Never add raw customer messages.
2. Put new unseen phrases in `tests/test_nlu.yml` to keep measuring honestly.
3. `rasa/scripts/train.sh 2026-11-01` trains in Docker, evaluates, and writes `rasa/models/ai-employee-nlu-2026-11-01.tar.gz` plus `rasa/results/evaluation-2026-11-01.txt`. It refuses to export if a wrong message would be routed.
4. Deploy: set `RASA_MODEL_VERSION=2026-11-01` in `.env`, then `docker compose up -d --build rasa`. Roll back by setting the previous version.
5. Check `GET /nlu/stats` afterwards.

Keep `ZWJ` (the joiner inside Sinhala letters like ප්‍ර) as typed in training data; the API only trims and collapses whitespace.

## Troubleshooting

| Symptom | Check |
|---|---|
| Every reply says `rasa_unavailable` | `docker compose ps rasa`, `docker compose logs rasa`; token mismatch gives 401 (`RASA_AUTH_TOKEN` must match in `.env` for both) |
| Rasa not used at all (`disabled`) | `RASA_ENABLED=true` **and** `RASA_BASE_URL` set; restart the API |
| API on host cannot reach Rasa | `RASA_BASE_URL=http://localhost:5005`; inside Compose it is `http://rasa:5005` |
| Intent keeps going to the LLM | See `fallbackReasons` in `/nlu/stats`; add examples for that intent |
| Wrong intent with high confidence | Add the phrase (or similar) under the right intent or `out_of_scope`, retrain, run `evaluate.py` |
| Slow first start | The image trains at build time (~2 min); startup afterwards is ~20 s |
| Out of memory | Limit is 1.5 GB in `docker-compose.yml`; usage is ~700 MB |
