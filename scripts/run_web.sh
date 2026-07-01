#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-8080}"
HOST="${WEB_SERVER_HOST:-127.0.0.1}"
CHAT_PORT="${CHAT_SERVER_PORT:-3001}"
CHAT_HOST="${CHAT_SERVER_HOST:-127.0.0.1}"

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

if [[ "${VITE_DEV:-}" == "1" ]]; then
  echo "VITE_DEV=1 — expecting the Vite dev server (run: npm run dev:ui). Skipping production build."
else
  echo "Building web UI (Vite: React + TypeScript + Tailwind)…"
  npm run build:ui
fi

export PORT
export WEB_SERVER_HOST="${HOST}"
export CHAT_SERVER_PORT="${CHAT_PORT}"
export CHAT_SERVER_HOST="${CHAT_HOST}"
export NO_PROXY="${NO_PROXY:-*.corp.amdocs.com,localhost,127.0.0.1,::1}"
export no_proxy="${NO_PROXY}"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
else
  echo "Warning: no .env file — chat will not work until you configure an API key."
  echo "  cp .env.example .env"
  echo "  Then set CURSOR_API_KEY (cursor.com/dashboard/integrations) or OPENAI_API_KEY."
fi

# Re-apply bind settings after .env (CLI / wrapper scripts take precedence via env already set)
export PORT="${PORT:-8080}"
export WEB_SERVER_HOST="${WEB_SERVER_HOST:-${HOST}}"
export CHAT_SERVER_PORT="${CHAT_SERVER_PORT:-${CHAT_PORT}}"
export CHAT_SERVER_HOST="${CHAT_SERVER_HOST:-127.0.0.1}"

# Internal URLs — chat stays on localhost; Node calls Flask on loopback
export CHAT_SERVER_URL="http://${CHAT_SERVER_HOST}:${CHAT_SERVER_PORT}"
export FLASK_BASE_URL="http://127.0.0.1:${PORT}"

print_network_urls() {
  local bind_host="$1"
  local bind_port="$2"
  if [[ "${bind_host}" == "0.0.0.0" || "${bind_host}" == "::" ]]; then
    echo ""
    echo "Share these URLs with teammates on the same network:"
    local ip
    for iface in en0 en1 en2 en3 bond0; do
      ip="$(ipconfig getifaddr "${iface}" 2>/dev/null || true)"
      if [[ -n "${ip}" ]]; then
        echo "  http://${ip}:${bind_port}"
      fi
    done
    echo ""
    echo "Firewall: allow inbound TCP ${bind_port} on this machine if others cannot connect."
    echo "LDAP login is required — users sign in with their Amdocs credentials."
    echo "Set a strong FLASK_SECRET_KEY in .env when exposing beyond localhost."
  fi
}

echo "Checking catalogone MCP and agent skills…"
if ! node server/preflight-check.js; then
  exit 1
fi

echo "Starting chat server at ${CHAT_SERVER_URL} (internal)"
node server/index.js &
CHAT_PID=$!

cleanup() {
  kill "${CHAT_PID}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

sleep 0.5

echo "Starting Catalog Tool web app on ${WEB_SERVER_HOST}:${PORT}"
if [[ "${WEB_SERVER_HOST}" == "127.0.0.1" || "${WEB_SERVER_HOST}" == "localhost" ]]; then
  echo "Local URL: http://127.0.0.1:${PORT}"
  echo "To allow others on your network: ./scripts/run_web_network.sh"
else
  echo "Listening on all interfaces — port ${PORT}"
  print_network_urls "${WEB_SERVER_HOST}" "${PORT}"
fi

exec .venv/bin/catalog-tool-web
