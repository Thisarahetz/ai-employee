#!/usr/bin/env bash
# Drops and re-migrates the *test* database only. Refuses any database whose
# name does not end in "_test", so it can never touch real business data.
set -euo pipefail
cd "$(dirname "$0")/.."
URL="${TEST_DATABASE_URL:-}"
if [[ -z "$URL" ]]; then
  set -a; [[ -f .env ]] && source .env; set +a
  BASE="${DATABASE_URL%%\?*}"
  URL="${BASE%/*}/ai_employee_test?schema=public"
fi
DB="$(echo "${URL%%\?*}" | sed -E 's#.*/##')"
if [[ "$DB" != *_test ]]; then
  echo "Refusing to reset \"$DB\": test database names must end in _test." >&2
  exit 1
fi
echo "Resetting test database $DB"
DATABASE_URL="$URL" npx prisma migrate reset --force --skip-seed --schema prisma/schema.prisma
