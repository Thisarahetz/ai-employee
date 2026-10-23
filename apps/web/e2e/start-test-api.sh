#!/usr/bin/env bash
# Starts the API for browser tests against the ISOLATED test database
# (name must end in _test). Never points at the dev database.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
set -a; [[ -f "$ROOT/.env" ]] && source "$ROOT/.env"; set +a

BASE="${DATABASE_URL%%\?*}"
export DATABASE_URL="${TEST_DATABASE_URL:-${BASE%/*}/ai_employee_test?schema=public}"
DB="$(echo "${DATABASE_URL%%\?*}" | sed -E 's#.*/##')"
if [[ "$DB" != *_test ]]; then
  echo "Refusing to start: \"$DB\" is not a test database." >&2
  exit 1
fi

export NODE_ENV=test
export API_PORT="${E2E_API_PORT:-3101}"
export WEB_URL="http://localhost:${E2E_WEB_PORT:-3100}"
export BULL_PREFIX="aiwe2e"
export AI_WORKFORCE_SCHEDULER=false
export AI_WORKFORCE_WORKER=false
export JWT_ACCESS_SECRET=e2e-access-secret-not-for-production-0001
export JWT_REFRESH_SECRET=e2e-refresh-secret-not-for-production-002
export CREDENTIALS_ENCRYPTION_KEY="$(head -c 32 /dev/urandom | base64)"
export INTERNAL_SERVICE_TOKEN=e2e-service-token
export RESEND_API_KEY=""
export N8N_API_URL=""
# Fake keys: browser tests check the UI, they must never spend real AI credit.
export AI_DEFAULT_PROVIDER=GEMINI
export AI_ALLOW_PLATFORM_KEYS=true
export GEMINI_API_KEY=e2e-fake-key-never-valid
export OPENAI_API_KEY=""
export ANTHROPIC_API_KEY=""

cd "$ROOT"
npx prisma migrate deploy --schema prisma/schema.prisma >/dev/null
cd "$ROOT/apps/api"
exec node --require ts-node/register/transpile-only src/main.ts
