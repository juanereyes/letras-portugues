#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

PORT="${PORT:-8000}"
AUTH_PORT="${AUTH_PORT:-8101}"
PROGRESS_PORT="${PROGRESS_PORT:-8102}"
INTERNAL_TOKEN="${INTERNAL_TOKEN:-$(python3 - <<'PY'
import secrets
print(secrets.token_hex(32))
PY
)}"

python3 - "$PORT" <<'PY'
import socket
import sys

port = int(sys.argv[1])
with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
    if probe.connect_ex(("127.0.0.1", port)) == 0:
        print(f"Port {port} is already in use. Stop the existing server or run with PORT=8001 ./run_backend.sh")
        sys.exit(1)
PY

export PORT AUTH_PORT PROGRESS_PORT INTERNAL_TOKEN
export AUTH_BASE_URL="http://127.0.0.1:${AUTH_PORT}"
export PROGRESS_BASE_URL="http://127.0.0.1:${PROGRESS_PORT}"

echo "Serving frontend from: $(pwd)/frontend"
echo "Gateway URL: http://127.0.0.1:${PORT}/"
echo "Private auth service: http://127.0.0.1:${AUTH_PORT}/"
echo "Private progress service: http://127.0.0.1:${PROGRESS_PORT}/"
echo "Only open the Gateway URL in the browser."

python3 -u backend/auth/service.py &
AUTH_PID=$!
python3 -u backend/progress/service.py &
PROGRESS_PID=$!

cleanup() {
  kill "$AUTH_PID" "$PROGRESS_PID" 2>/dev/null || true
}
trap cleanup EXIT

python3 -u backend/gateway/server.py
