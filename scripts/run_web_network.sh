#!/usr/bin/env bash
# Start Catalog Tool so teammates on the same network can connect.
# Equivalent to: WEB_SERVER_HOST=0.0.0.0 FLASK_DEBUG=false ./scripts/run_web.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export WEB_SERVER_HOST=0.0.0.0
export FLASK_DEBUG=false
exec "${ROOT}/scripts/run_web.sh" "$@"
