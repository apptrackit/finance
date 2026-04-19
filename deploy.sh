#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
DIM='\033[2m'
NC='\033[0m'

SPIN_PID=""
TMPOUT=$(mktemp)

kill_spinner() {
  if [ -n "$SPIN_PID" ]; then
    kill "$SPIN_PID" 2>/dev/null || true
    wait "$SPIN_PID" 2>/dev/null || true
  fi
  SPIN_PID=""
}
trap 'kill_spinner; rm -f "$TMPOUT"' EXIT INT TERM

err() { echo -e "${RED}$1${NC}" >&2; exit 1; }

spin() {
  local fmt="$1" label="$2"
  local frames=('|' '/' '-' '\') i=0
  while true; do
    printf "\r${fmt}" "$label"
    printf "${DIM}%s${NC}" "${frames[$i]}"
    i=$(( (i + 1) % 4 ))
    sleep 0.1
  done
}

step() {
  local label="$1"; shift
  spin "  %-22s" "$label" &
  SPIN_PID=$!
  if "$@" >"$TMPOUT" 2>&1; then
    kill_spinner
    local url
    url=$(grep -Eo 'https://[^[:space:]]+(workers\.dev|pages\.dev)[^[:space:]]*' "$TMPOUT" | tail -1 || true)
    [ -n "$url" ] && printf "\r  %-22s${GREEN}ok${NC}  ${DIM}${url}${NC}\033[K\n" "$label" \
                  || printf "\r  %-22s${GREEN}ok${NC}\033[K\n" "$label"
  else
    kill_spinner
    printf "\r  %-22s${RED}failed${NC}\033[K\n" "$label"
    echo "" >&2
    cat "$TMPOUT" >&2
    exit 1
  fi
}

d1() { npx wrangler d1 execute finance-db --remote --yes "$@"; }

migration_is_new() {
  local count
  count=$(d1 --json --command "SELECT COUNT(*) as count FROM migration_history WHERE migration_name = '${1}'" 2>/dev/null \
    | grep -o '"count":[[:space:]]*[0-9]*' | grep -o '[0-9]*$' || echo "0")
  [ "${count:-0}" = "0" ]
}

# ─── Branch check ─────────────────────────────────────────────────────────────

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
BRANCH_FLAG=""

if [ "$CURRENT_BRANCH" != "main" ] && [ "$CURRENT_BRANCH" != "unknown" ]; then
  printf "Branch '%s' is not main. Deploy anyway? (y/N) " "$CURRENT_BRANCH"
  read -r CONFIRM
  [[ "$CONFIRM" =~ ^[Yy]$ ]] || err "Cancelled."
  BRANCH_FLAG="--branch=main"
fi

# ─── Project name ─────────────────────────────────────────────────────────────

CONFIG_FILE="$(git rev-parse --show-toplevel 2>/dev/null || echo .)/.deploy-config"

if [ -n "${1:-}" ]; then
  PROJECT_NAME="$1"
  echo "$PROJECT_NAME" > "$CONFIG_FILE"
elif [ -f "$CONFIG_FILE" ]; then
  PROJECT_NAME=$(cat "$CONFIG_FILE")
else
  printf "Project name: "
  read -r PROJECT_NAME
  [ -z "$PROJECT_NAME" ] && err "Project name required."
  echo "$PROJECT_NAME" > "$CONFIG_FILE"
fi

echo ""

# ─── Wrangler check ───────────────────────────────────────────────────────────

cd api

if ! npx wrangler --version >/dev/null 2>&1; then
  spin "  %-22s" "Repairing wrangler" &
  SPIN_PID=$!
  npm rebuild workerd wrangler >/dev/null 2>&1 || true
  npx wrangler --version >/dev/null 2>&1 || {
    (cd .. && npm install >/dev/null 2>&1) || true
    npx wrangler --version >/dev/null 2>&1 || {
      kill_spinner
      err "Wrangler not runnable. Try: rm -rf node_modules && npm install"
    }
  }
  kill_spinner
  printf "\r  %-22s${GREEN}ok${NC}\n" "Repairing wrangler"
fi

# ─── Migrations ───────────────────────────────────────────────────────────────

echo "  Migrations"
step "  DB" d1 --command "CREATE TABLE IF NOT EXISTS migration_history (id TEXT PRIMARY KEY, migration_name TEXT NOT NULL UNIQUE, executed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"

APPLIED=0
if [ -d "migrations" ]; then
  for migration_file in migrations/*.sql; do
    [ -f "$migration_file" ] || continue
    migration_name=$(basename "$migration_file" .sql)

    spin "    %-20s" "$migration_name" &
    SPIN_PID=$!

    if migration_is_new "$migration_name"; then
      if d1 --file="$migration_file" >/dev/null 2>&1; then
        d1 --command "INSERT OR IGNORE INTO migration_history (id, migration_name) VALUES ('${migration_name}_$(date +%s)', '${migration_name}')" >/dev/null 2>&1
        kill_spinner
        printf "\r    + %-18s${GREEN}ok${NC}\n" "$migration_name"
        APPLIED=$((APPLIED + 1))
      else
        kill_spinner
        printf "\r    + %-18s${RED}failed${NC}\n" "$migration_name"
        err "Migration failed: $migration_name"
      fi
    else
      kill_spinner
      printf "\r\033[K"
    fi
  done
fi

[ "$APPLIED" = "0" ] && echo "    up to date"
echo ""

# ─── API ──────────────────────────────────────────────────────────────────────

step "API" npm run deploy

# ─── Client ───────────────────────────────────────────────────────────────────

cd ../client
step "Client build" npm run build

DEPLOY_CMD=(npx wrangler pages deploy dist --project-name="${PROJECT_NAME}")
[ -n "$BRANCH_FLAG" ] && DEPLOY_CMD+=("$BRANCH_FLAG")
step "Client deploy" "${DEPLOY_CMD[@]}"

# ─── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}Deployed ${PROJECT_NAME}${NC}"
[ -n "$BRANCH_FLAG" ] && echo -e "${DIM}  ${CURRENT_BRANCH} -> main${NC}"
