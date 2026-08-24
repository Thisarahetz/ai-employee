#!/usr/bin/env bash
# Installs the AI Employee platform: workspace deps, infra containers, DB schema.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "==> AI Employee: install"

if [ ! -f .env ]; then
  echo "-- Creating .env from .env.example (edit it to add your OpenAI/Anthropic keys, etc.)"
  cp .env.example .env
else
  echo "-- .env already exists, leaving it as-is"
fi

# pnpm/prisma run with cwd inside apps/api, so they won't find the root .env on
# their own — export it into this shell so every child process inherits it.
set -a
# shellcheck disable=SC1091
source .env
set +a

echo "-- Installing workspace dependencies (pnpm install)"
pnpm install

echo "-- Starting postgres, redis, n8n (docker compose)"
docker compose up -d postgres redis n8n

echo "-- Waiting for postgres to become healthy"
for i in $(seq 1 60); do
  status="$(docker inspect -f '{{.State.Health.Status}}' ai-employee-postgres 2>/dev/null || echo "starting")"
  [ "$status" = "healthy" ] && break
  sleep 1
done

echo "-- Generating Prisma client"
pnpm prisma:generate

echo "-- Applying database schema"
if ! pnpm prisma:migrate -- --name init --skip-seed; then
  echo "   (non-interactive shell — falling back to 'prisma db push')"
  pnpm --filter @ai-employee/api exec prisma db push
fi

echo "-- Seeding demo accounts (idempotent — safe to re-run)"
pnpm prisma:seed

echo
echo "✔ Install complete."
echo "  Log in with: admin@davinlabs.com / ChangeMe123! (super admin)"
echo "           or: owner@acme.test / ChangeMe123! (salon tenant owner)"
echo "  Next: ./start.sh"
