#!/usr/bin/env bash
# Starts the AI Employee platform (infra containers + api/web dev servers)
# and opens the browser.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "==> AI Employee: start"

# ----------------------------------------
# Environment
# ----------------------------------------

if [ ! -f .env ]; then
  echo "-- No .env found — creating one from .env.example"
  cp .env.example .env
fi

# Export environment variables so apps/api and apps/web inherit them.
set -a
# shellcheck disable=SC1091
source .env
set +a

# ----------------------------------------
# Dependencies Check
# ----------------------------------------

if [ ! -d "node_modules" ] || [ ! -f "node_modules/.bin/turbo" ]; then
  echo "-- Dependencies not found. Installing workspace dependencies..."
  pnpm install
  pnpm prisma:generate
fi


# ----------------------------------------
# Stop existing dev process
# ----------------------------------------

if [ -f .dev.pid ]; then
  OLD_PID="$(cat .dev.pid || true)"

  if [ -n "${OLD_PID:-}" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "-- Stopping previous dev server (PID: $OLD_PID)"
    kill "$OLD_PID" 2>/dev/null || true

    # Give it a moment to shut down cleanly
    sleep 2

    # Force kill if still running
    if kill -0 "$OLD_PID" 2>/dev/null; then
      kill -9 "$OLD_PID" 2>/dev/null || true
    fi
  fi

  rm -f .dev.pid
fi

# ----------------------------------------
# Clear ports used by the platform
# ----------------------------------------

echo "-- Clearing existing processes on required ports"

for PORT in 3000 3001; do
  PIDS="$(lsof -ti tcp:$PORT 2>/dev/null || true)"

  if [ -n "$PIDS" ]; then
    echo "   Port $PORT is in use. Stopping process(es): $PIDS"

    for PID in $PIDS; do
      kill "$PID" 2>/dev/null || true
    done

    sleep 1

    # Force kill anything still using the port
    PIDS="$(lsof -ti tcp:$PORT 2>/dev/null || true)"

    if [ -n "$PIDS" ]; then
      echo "   Force stopping process(es) on port $PORT: $PIDS"

      for PID in $PIDS; do
        kill -9 "$PID" 2>/dev/null || true
      done
    fi
  else
    echo "   Port $PORT is available"
  fi
done

# ----------------------------------------
# Infrastructure
# ----------------------------------------

echo "-- Ensuring postgres, redis, n8n are running"

# Stop old containers if needed and start infrastructure
docker compose up -d postgres redis n8n

# ----------------------------------------
# Start API + Web
# ----------------------------------------

echo "-- Starting API + Web (pnpm dev)"

# Start in background and save logs
pnpm dev > >(tee /tmp/ai-employee-dev.log) 2>&1 &

DEV_PID=$!

echo "$DEV_PID" > .dev.pid

echo "   PID:  $DEV_PID"
echo "   Logs: /tmp/ai-employee-dev.log"

# ----------------------------------------
# Wait for Web App
# ----------------------------------------

echo "-- Waiting for the web app on http://localhost:3000"

WEB_READY=false

for i in $(seq 1 90); do
  if ! kill -0 "$DEV_PID" 2>/dev/null; then
    echo "❌ Dev server process exited unexpectedly."
    echo "  Check logs: /tmp/ai-employee-dev.log"
    exit 1
  fi

  code="$(curl -s -o /dev/null -w '%{http_code}' \
    http://localhost:3000 2>/dev/null || true)"

  case "$code" in
    2*|3*)
      WEB_READY=true
      echo "   Web app is ready!"
      break
      ;;
  esac

  sleep 2
done

if [ "$WEB_READY" = false ]; then
  echo "⚠ Web app did not respond within the expected time."
  echo "  Check logs: /tmp/ai-employee-dev.log"
fi

# ----------------------------------------
# Open Browser
# ----------------------------------------

echo "-- Opening browser"

if command -v open >/dev/null 2>&1; then
  # macOS
  open http://localhost:3000
  open http://localhost:5678

elif command -v xdg-open >/dev/null 2>&1; then
  # Linux
  xdg-open http://localhost:3000 >/dev/null 2>&1 &
  xdg-open http://localhost:5678 >/dev/null 2>&1 &

else
  echo "   No browser opener found — visit the URLs manually."
fi

# ----------------------------------------
# Done
# ----------------------------------------

echo
echo "========================================="
echo "✔ AI Employee is running"
echo "========================================="
echo
echo "  Web:  http://localhost:3000"
echo "  API:  http://localhost:3001"
echo "  n8n:  http://localhost:5678"
echo
echo "  Logs: /tmp/ai-employee-dev.log"
echo
echo "  To stop:"
echo "  kill \$(cat .dev.pid) 2>/dev/null || true"
echo "  docker compose stop"
echo