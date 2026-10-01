#!/usr/bin/env bash
# Read-only health check for the verification instance started by launch.sh.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SKILL_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
RUN_DIR="$SKILL_DIR/run"
ENV_FILE="$RUN_DIR/instance.env"

fail() {
  echo "DOCTOR FAIL: $*"
  exit 1
}

[[ -f "$ENV_FILE" ]] || fail "no instance record at $ENV_FILE. Run scripts/launch.sh first."

# shellcheck disable=SC1090
source "$ENV_FILE"

for pair in "relay:$RELAY_PID" "host:$HOST_PID" "phone:$PHONE_PID"; do
  name=${pair%%:*}
  pid=${pair##*:}
  kill -0 "$pid" 2>/dev/null || fail "$name pid $pid is not running"
done

relay_cmd=$(ps -p "$RELAY_PID" -o command=)
host_cmd=$(ps -p "$HOST_PID" -o command=)
phone_cmd=$(ps -p "$PHONE_PID" -o command=)

[[ "$relay_cmd" == *"server.js"* ]] || fail "relay pid $RELAY_PID command is not server.js: $relay_cmd"
[[ "$host_cmd" == *"vite.verify.config.js"* ]] || fail "host pid $HOST_PID is not the verification vite config: $host_cmd"
[[ "$phone_cmd" == *"vite.verify.config.js"* ]] || fail "phone pid $PHONE_PID is not the verification vite config: $phone_cmd"

relay_body=$(curl -sf "http://127.0.0.1:${RELAY_PORT}" || true)
[[ "$relay_body" == "ok" ]] || fail "relay http://127.0.0.1:${RELAY_PORT} returned '${relay_body}', expected ok"

host_html=$(curl -sf "http://127.0.0.1:${HOST_PORT}" || true)
[[ "$host_html" == *"Wii Bowling — Host"* ]] || fail "host ${HOST_URL} did not serve the host document"

phone_html=$(curl -sf "http://127.0.0.1:${PHONE_PORT}" || true)
[[ "$phone_html" == *"Wii Bowling — Controller"* ]] || fail "phone ${PHONE_URL} did not serve the controller document"

owns_port() {
  local port=$1
  local pid=$2
  local listeners
  listeners=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | sort -u || true)
  [[ -n "$listeners" ]] || fail "nothing is listening on port $port"
  echo "$listeners" | grep -qx "$pid" || fail "port $port is owned by [$listeners], not pid $pid"
}

owns_port "$RELAY_PORT" "$RELAY_PID"
owns_port "$HOST_PORT" "$HOST_PID"
owns_port "$PHONE_PORT" "$PHONE_PID"

echo "DOCTOR OK"
echo "host ${HOST_URL} pid ${HOST_PID}"
echo "phone ${PHONE_URL} pid ${PHONE_PID}"
echo "relay ${RELAY_URL} pid ${RELAY_PID}"
