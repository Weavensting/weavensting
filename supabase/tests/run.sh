#!/usr/bin/env bash
# Run the database tests against a throwaway Postgres database.
#
#   supabase/tests/run.sh "postgresql://postgres@localhost:5432"
#
# Creates (and drops) a database called cookbook_test on that server, applies
# the stubs, the migrations and the test files, and fails if any check does.
set -euo pipefail

BASE="${1:-postgresql://postgres@localhost:5432}"
DB=cookbook_test
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"

psql "$BASE/postgres" -q -c "drop database if exists $DB" -c "create database $DB"
TARGET="$BASE/$DB"

for f in "$HERE/00_supabase_stubs.sql" "$ROOT"/migrations/*.sql; do
  psql "$TARGET" -v ON_ERROR_STOP=1 -q -f "$f"
done

failures=0
for f in "$HERE"/0[12]_*.sql; do
  echo "── $(basename "$f")"
  output=$(psql "$TARGET" -f "$f" 2>&1)
  echo "$output" | grep -vE '^\s*$|^-+$|^\(1 row\)|^SET$|^INSERT|^GRANT|^DO$|^UPDATE|^DELETE|^RESET|^ *pass *$|^ *[a-z_]+ *$'
  if echo "$output" | grep -qE '^ f$|ERROR'; then
    echo "  FAILED"
    echo "$output" | grep -E '^ f$|ERROR' | head -5
    failures=$((failures + 1))
  fi
done

psql "$BASE/postgres" -q -c "drop database if exists $DB"
if [ "$failures" -gt 0 ]; then echo "$failures test file(s) failed"; exit 1; fi
echo "All database tests passed."
