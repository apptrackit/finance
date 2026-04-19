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

# ─── Config helpers ───────────────────────────────────────────────────────────

CONFIG_FILE="$(git rev-parse --show-toplevel 2>/dev/null || echo .)/.deploy-config"

get_cfg() { grep "^${1}=" "$CONFIG_FILE" 2>/dev/null | cut -d= -f2-; }

set_cfg() {
  if grep -q "^${1}=" "$CONFIG_FILE" 2>/dev/null; then
    sed -i '' "s|^${1}=.*|${1}=${2}|" "$CONFIG_FILE"
  else
    echo "${1}=${2}" >> "$CONFIG_FILE"
  fi
}

need() {
  local key="$1" label="$2" secret="${3:-}"
  local val
  val=$(get_cfg "$key")
  if [ -z "$val" ]; then
    if [ -n "$secret" ]; then
      printf "%s: " "$label" >&2; read -rs val; echo >&2
    else
      printf "%s: " "$label" >&2; read -r val
    fi
    [ -z "$val" ] && err "${label} is required."
    set_cfg "$key" "$val"
  fi
  printf '%s' "$val"
}

d1() { npx wrangler d1 execute finance-db --remote --yes --config wrangler.prod.toml "$@"; }

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

# ─── Config / secrets ─────────────────────────────────────────────────────────

echo ""
PROJECT_NAME=$(need PROJECT_NAME   "Project name")
DATABASE_ID=$(need  DATABASE_ID    "Database ID")
API_SECRET=$(need   API_SECRET     "API secret"                       secret)
ORIGINS=$(need      ALLOWED_ORIGINS "Allowed origins (comma-separated)")
PUB_KEY=$(need      PUBLIC_API_KEY  "Public API key (or 'off')")
echo ""

# ─── Wrangler check ───────────────────────────────────────────────────────────

cd api

if ! npx wrangler whoami >/dev/null 2>&1; then
  err "Not logged in. Run: npx wrangler login"
fi

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
  printf "\r  %-22s${GREEN}ok${NC}\033[K\n" "Repairing wrangler"
fi

# ─── Generate wrangler config ─────────────────────────────────────────────────

cat > wrangler.prod.toml << TOML
name = "finance-api"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]
main = "src/index.ts"

workers_dev = true

[define]
__dirname = "'/'"

[[d1_databases]]
binding = "DB"
database_name = "finance-db"
database_id = "${DATABASE_ID}"

[triggers]
crons = ["0 0 * * *"]
TOML

# ─── Secrets ──────────────────────────────────────────────────────────────────

echo "  Secrets"
for entry in "API_SECRET:${API_SECRET}" "ALLOWED_ORIGINS:${ORIGINS}" "PUBLIC_API_KEY:${PUB_KEY}"; do
  key="${entry%%:*}"
  val="${entry#*:}"
  spin "    %-20s" "$key" &
  SPIN_PID=$!
  if echo "$val" | npx wrangler versions secret put "$key" --config wrangler.prod.toml >"$TMPOUT" 2>&1; then
    kill_spinner
    printf "\r    %-20s${GREEN}ok${NC}\033[K\n" "$key"
  else
    kill_spinner
    printf "\r    %-20s${RED}failed${NC}\033[K\n" "$key"
    echo "" >&2
    cat "$TMPOUT" >&2
    err "Failed to set secret: $key"
  fi
done
echo ""

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
        printf "\r    + %-18s${GREEN}ok${NC}\033[K\n" "$migration_name"
        APPLIED=$((APPLIED + 1))
      else
        kill_spinner
        printf "\r    + %-18s${RED}failed${NC}\033[K\n" "$migration_name"
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

spin "  %-22s" "API" &
SPIN_PID=$!
if npx wrangler deploy --minify --config wrangler.prod.toml >"$TMPOUT" 2>&1; then
  API_URL=$(grep -Eo 'https://[^[:space:]]+\.workers\.dev[^[:space:]]*' "$TMPOUT" | tail -1 || true)
  # Fall back to saved URL if wrangler output format didn't match
  [ -z "$API_URL" ] && API_URL=$(get_cfg "API_URL")
  if [ -z "$API_URL" ]; then
    kill_spinner
    printf "\r  %-22s${RED}failed${NC}\033[K\n" "API"
    err "Could not determine API URL. Add API_URL=https://... to .deploy-config and retry."
  fi
  set_cfg "API_URL" "$API_URL"
  API_DOMAIN="${API_URL#https://}"
  kill_spinner
  printf "\r  %-22s${GREEN}ok${NC}  ${DIM}${API_URL}${NC}\033[K\n" "API"
else
  kill_spinner
  printf "\r  %-22s${RED}failed${NC}\033[K\n" "API"
  echo "" >&2; cat "$TMPOUT" >&2
  exit 1
fi

# ─── Client ───────────────────────────────────────────────────────────────────

cd ../client
[ -z "$API_DOMAIN" ] && err "API_DOMAIN is empty — check API_URL in .deploy-config"
[ -z "$API_SECRET" ] && err "API_SECRET is empty — check .deploy-config"
printf 'VITE_API_DOMAIN=%s\nVITE_API_KEY=%s\n' "$API_DOMAIN" "$API_SECRET" > .env.production
echo -e "  ${DIM}  API: ${API_DOMAIN}${NC}"
step "Client build" npm run build
rm -f .env.production
if ! grep -qr "$API_DOMAIN" dist/assets/ 2>/dev/null; then
  echo -e "${RED}  Warning: API domain not found in built assets — env injection may have failed${NC}" >&2
fi
sed -i '' "s|DEPLOY_API_ORIGIN|${API_URL}|g" dist/_headers

DEPLOY_CMD=(npx wrangler pages deploy dist --project-name="${PROJECT_NAME}")
[ -n "$BRANCH_FLAG" ] && DEPLOY_CMD+=("$BRANCH_FLAG")
step "Client deploy" "${DEPLOY_CMD[@]}"

# ─── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}Deployed ${PROJECT_NAME}${NC}"
[ -n "$BRANCH_FLAG" ] && echo -e "${DIM}  ${CURRENT_BRANCH} -> main${NC}"
