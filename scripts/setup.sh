#!/usr/bin/env bash
#
# Everything after the Supabase signup.
#
#   scripts/setup.sh
#
# Checks what is in place, applies the migrations, deploys the Edge Functions
# and tells you exactly what is still missing. Safe to run again at any point —
# every step is idempotent.
set -uo pipefail

cd "$(dirname "$0")/.."

BOLD=$'\033[1m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; OFF=$'\033[0m'
ok()    { echo "  ${GREEN}✓${OFF} $*"; }
warn()  { echo "  ${YELLOW}!${OFF} $*"; }
bad()   { echo "  ${RED}✗${OFF} $*"; }
step()  { echo; echo "${BOLD}$*${OFF}"; }

problems=0
note_problem() { problems=$((problems + 1)); }

# ---------------------------------------------------------------------------
step "1. Tools"
# ---------------------------------------------------------------------------

if command -v node >/dev/null 2>&1; then
  ok "node $(node -v)"
else
  bad "node is not installed — https://nodejs.org"; note_problem
fi

SUPABASE=""
if command -v supabase >/dev/null 2>&1; then
  SUPABASE="supabase"
  ok "supabase CLI $(supabase --version 2>/dev/null | head -1)"
elif npx --no-install supabase --version >/dev/null 2>&1; then
  SUPABASE="npx supabase"
  ok "supabase CLI (via npx)"
else
  bad "supabase CLI not found — npm install -g supabase"; note_problem
fi

# ---------------------------------------------------------------------------
step "2. Your .env"
# ---------------------------------------------------------------------------

if [ ! -f .env ]; then
  cp .env.example .env
  warn "created .env from the example — fill it in and run this again"
  note_problem
else
  ok ".env exists"
fi

env_value() {
  # Last assignment wins, matching how dotenv reads the file.
  grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"'\''' | xargs || true
}

SUPABASE_URL="$(env_value EXPO_PUBLIC_SUPABASE_URL)"
ANON_KEY="$(env_value EXPO_PUBLIC_SUPABASE_ANON_KEY)"
GOOGLE_WEB="$(env_value EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID)"

case "$SUPABASE_URL" in
  ""|*your-project*) bad "EXPO_PUBLIC_SUPABASE_URL is not set (Supabase → Settings → API)"; note_problem ;;
  *) ok "Supabase URL: $SUPABASE_URL" ;;
esac

case "$ANON_KEY" in
  ""|your-anon-key) bad "EXPO_PUBLIC_SUPABASE_ANON_KEY is not set"; note_problem ;;
  *) ok "anon key: ${ANON_KEY:0:12}…" ;;
esac

case "$GOOGLE_WEB" in
  ""|*xxxx*) warn "no Google client IDs — Sign in with Apple only (fine on iOS)" ;;
  *) ok "Google sign-in configured" ;;
esac

# The project ref is the subdomain of the Supabase URL.
PROJECT_REF="$(printf '%s' "$SUPABASE_URL" | sed -E 's#https?://##; s#\..*##')"

# ---------------------------------------------------------------------------
step "3. Database"
# ---------------------------------------------------------------------------

if [ -z "$SUPABASE" ] || [ -z "$PROJECT_REF" ]; then
  warn "skipped — needs the CLI and a Supabase URL"
else
  if [ ! -f supabase/.temp/project-ref ] && [ ! -L supabase/.temp/project-ref ]; then
    echo "  linking to $PROJECT_REF (it will ask for your database password)"
    $SUPABASE link --project-ref "$PROJECT_REF" || { bad "link failed"; note_problem; }
  else
    ok "already linked"
  fi

  echo "  applying migrations…"
  if $SUPABASE db push; then
    ok "schema, policies and functions are up to date"
  else
    bad "db push failed — see the output above"; note_problem
  fi
fi

# ---------------------------------------------------------------------------
step "4. Edge Functions"
# ---------------------------------------------------------------------------

if [ -z "$SUPABASE" ] || [ -z "$PROJECT_REF" ]; then
  warn "skipped — needs the CLI and a Supabase URL"
else
  # Reading photos and dictation needs a Claude key; everything else does not.
  if $SUPABASE secrets list 2>/dev/null | grep -q ANTHROPIC_API_KEY; then
    ok "ANTHROPIC_API_KEY is set on the server"
  else
    warn "ANTHROPIC_API_KEY not set — photo and dictation import will be off"
    echo "      supabase secrets set ANTHROPIC_API_KEY=sk-ant-..."
  fi

  echo "  deploying functions…"
  if $SUPABASE functions deploy extract-recipe fetch-page estimate-nutrition; then
    ok "extract-recipe, fetch-page, estimate-nutrition deployed"
  else
    bad "deploy failed — see the output above"; note_problem
  fi
fi

# ---------------------------------------------------------------------------
step "5. Sign in with Apple"
# ---------------------------------------------------------------------------

BUNDLE_ID="${BUNDLE_ID:-com.familycookbook.app}"
echo "  Bundle ID: ${BOLD}$BUNDLE_ID${OFF}"
echo
echo "  These two are done by hand — there is no API for either:"
echo "    1. Apple Developer → Certificates, IDs & Profiles → your App ID"
echo "       → enable ${BOLD}Sign in with Apple${OFF}"
echo "    2. Supabase → Authentication → Providers → ${BOLD}Apple${OFF} → enable,"
echo "       and add ${BOLD}$BUNDLE_ID${OFF} to Authorized Client IDs"
echo
echo "  Native iOS sign-in needs nothing else — no Services ID, no .p8 key."
echo "  Those are only for the web sign-in flow."

# ---------------------------------------------------------------------------
step "Summary"
# ---------------------------------------------------------------------------

if [ "$problems" -eq 0 ]; then
  ok "Everything this script can check is in place."
  echo
  echo "  Next, once the two manual steps above are done:"
  echo "    npx expo run:ios            # needs a Mac with Xcode"
  echo "    eas build -p ios --profile development   # or build in the cloud"
else
  bad "$problems thing(s) need attention — see above, then run this again."
  exit 1
fi
