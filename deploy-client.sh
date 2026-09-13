#!/bin/bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
CONFIG_FILE="${ROOT_DIR}/.deploy-config"
CLIENT_DIR="${ROOT_DIR}/client"

err() { echo "$1" >&2; exit 1; }

get_cfg() {
  awk -v key="$1" '
    index($0, key "=") == 1 { value = substr($0, length(key) + 2) }
    END { if (value != "") print value }
  ' "$CONFIG_FILE" 2>/dev/null
}

need_cfg() {
  local key="$1" label="$2" value
  value=$(get_cfg "$key")
  [ -n "$value" ] || err "${label} is missing from .deploy-config. Run ./deploy.sh once or add ${key}=..."
  printf '%s' "$value"
}

PROJECT_NAME=$(need_cfg PROJECT_NAME "Cloudflare Pages project name")
API_URL=$(need_cfg API_URL "API URL")
API_SECRET=$(need_cfg API_SECRET "API secret")
API_DOMAIN="${API_URL#https://}"

CURRENT_BRANCH=$(git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
BRANCH_FLAG=""
if [ "$CURRENT_BRANCH" != "main" ] && [ "$CURRENT_BRANCH" != "unknown" ]; then
  printf "Branch '%s' is not main. Deploy anyway? (y/N) " "$CURRENT_BRANCH"
  read -r CONFIRM
  [[ "$CONFIRM" =~ ^[Yy]$ ]] || err "Cancelled."
  BRANCH_FLAG="--branch=main"
fi

cd "$CLIENT_DIR"
ENV_FILE=".env.production"
cleanup() { rm -f "$ENV_FILE"; }
trap cleanup EXIT INT TERM

if ! npx wrangler whoami >/dev/null 2>&1; then
  err "Not logged in. Run: npx wrangler login"
fi

printf 'VITE_API_DOMAIN=%s\nVITE_API_KEY=%s\n' "$API_DOMAIN" "$API_SECRET" > "$ENV_FILE"
npm run build

if ! grep -qr "$API_DOMAIN" dist/assets/ 2>/dev/null; then
  err "API domain was not included in the build."
fi

sed -i '' "s|DEPLOY_API_ORIGIN|${API_URL}|g" dist/_headers

DEPLOY_CMD=(npx wrangler pages deploy dist --project-name="$PROJECT_NAME")
[ -n "$BRANCH_FLAG" ] && DEPLOY_CMD+=("$BRANCH_FLAG")
"${DEPLOY_CMD[@]}"
