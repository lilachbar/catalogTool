#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-8080}"
HOST="${WEB_SERVER_HOST:-127.0.0.1}"
CHAT_PORT="${CHAT_SERVER_PORT:-3001}"

if lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port ${PORT} is already in use."
  echo "Stop the other process, or start on another port:"
  echo "  PORT=8081 ./scripts/run_web.sh"
  exit 1
fi

if lsof -nP -iTCP:"${CHAT_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Chat port ${CHAT_PORT} is already in use."
  echo "Stop the other process, or set CHAT_SERVER_PORT to another value."
  exit 1
fi

if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
.venv/bin/pip install -q -e .

if [[ ! -d node_modules ]]; then
  echo "Installing Node dependencies for chat agent…"
  npm install
fi

if [[ ! -f catalog_tool/web/static/chat.bundle.js ]] || [[ server/index.js -nt catalog_tool/web/static/chat.bundle.js ]]; then
  echo "Building chat UI bundle…"
  npm run build:chat
fi

export PORT
export WEB_SERVER_HOST="${HOST}"
export CHAT_SERVER_PORT="${CHAT_PORT}"
export CHAT_SERVER_URL="http://127.0.0.1:${CHAT_PORT}"
export FLASK_BASE_URL="http://${HOST}:${PORT}"
export NO_PROXY="${NO_PROXY:-*.corp.amdocs.com,localhost,127.0.0.1,::1}"
export no_proxy="${NO_PROXY}"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

echo "Starting chat server at http://127.0.0.1:${CHAT_PORT}"
node server/index.js &
CHAT_PID=$!

cleanup() {
  kill "${CHAT_PID}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

sleep 0.5

echo "Starting Catalog Tool web app at http://${HOST}:${PORT}"
exec .venv/bin/catalog-tool-web
