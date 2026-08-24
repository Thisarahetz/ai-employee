#!/usr/bin/env bash
# Starts the AI Employee platform (infra containers + api/web dev servers) and opens the browser.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "==> AI Employee: start"

if [ ! -f .env ]; then
  echo "-- No .env found — creating one from .env.example (run ./install.sh first for a full setup)"
  cp .env.example .env
fi

# pnpm dev spawns apps/api and apps/web with cwd inside their own app dirs, so
# they won't find the root .env on their own — export it so both inherit it.
set -a
# shellcheck disable=SC1091
source .env
set +a

echo "-- Ensuring postgres, redis, n8n are running"
docker compose up -d postgres redis n8n

echo "-- Starting API + Web (pnpm dev)"
pnpm dev > /tmp/ai-employee-dev.log 2>&1 &
DEV_PID=$!
echo "$DEV_PID" > .dev.pid
echo "   logs: /tmp/ai-employee-dev.log  (pid $DEV_PID)"

echo "-- Waiting for the web app on http://localhost:3000"
for i in $(seq 1 90); do
  code="$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000 2>/dev/null || true)"
  case "$code" in
    2*|3*) break ;;
  esac
  sleep 2
done

echo "-- Opening browser"
if command -v open >/dev/null 2>&1; then
  open http://localhost:3000       # AI Employee dashboard
  open http://localhost:5678       # n8n
else
  echo "   (no 'open' command found — visit the URLs below manually)"
fi

echo
echo "✔ AI Employee is running."
echo "  Web:  http://localhost:3000"
echo "  API:  http://localhost:3001"
echo "  n8n:  http://localhost:5678"
echo "  Stop: kill \$(cat .dev.pid) && docker compose stop"
