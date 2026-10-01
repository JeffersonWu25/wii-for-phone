#!/usr/bin/env bash
# Start an isolated WildHacks Arcade verification instance.
# Relay 18080, host 15173, phone 15174. Refuses to start if any of those ports
# is already taken. Does not touch 8080, 5173, or 5174.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../../../.." && pwd)
SKILL_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
RUN_DIR="$SKILL_DIR/run"

RELAY_PORT=18080
HOST_PORT=15173
PHONE_PORT=15174

if [[ -f "$RUN_DIR/instance.env" ]]; then
  echo "A verification instance record already exists at $RUN_DIR/instance.env"
  echo "Run scripts/doctor.sh. If that instance is dead, run scripts/cleanup.sh, then launch again."
  exit 1
fi

port_listeners() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN 2>/dev/null || true
}

for port in "$RELAY_PORT" "$HOST_PORT" "$PHONE_PORT"; do
  listeners=$(port_listeners "$port")
  if [[ -n "$listeners" ]]; then
    echo "Port $port is already in use. Refusing to start another instance."
    echo "$listeners"
    exit 1
  fi
done

mkdir -p "$RUN_DIR"

# Vite resolves packages from the config file's directory. These templates are
# copied into host/ and phone/ for the run and removed by cleanup.sh.
cp "$SCRIPT_DIR/host.vite.config.js" "$REPO_ROOT/host/vite.verify.config.js"
cp "$SCRIPT_DIR/phone.vite.config.js" "$REPO_ROOT/phone/vite.verify.config.js"

# Detach into a new session. A background job in this script is killed when the
# launching shell exits, which would take the instance down before doctor runs.
start_detached() {
  local workdir=$1
  local logfile=$2
  local pidfile=$3
  shift 3
  (
    cd "$workdir"
    python3 -c '
import os, sys
logfile, pidfile = sys.argv[1], sys.argv[2]
cmd = sys.argv[3:]
if os.fork() > 0:
    raise SystemExit(0)
os.setsid()
with open(pidfile, "w") as fh:
    fh.write(str(os.getpid()))
fd = os.open(logfile, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o644)
os.dup2(fd, 1)
os.dup2(fd, 2)
os.close(fd)
os.execvp(cmd[0], cmd)
' "$logfile" "$pidfile" "$@"
  )
  for _ in $(seq 1 50); do
    if [[ -s "$pidfile" ]]; then
      cat "$pidfile"
      return 0
    fi
    sleep 0.05
  done
  echo "Failed to record pid for: $*" >&2
  return 1
}

RELAY_PID=$(
  PORT="$RELAY_PORT" start_detached \
    "$REPO_ROOT/relay" \
    "$RUN_DIR/relay.log" \
    "$RUN_DIR/relay.pid" \
    node server.js
)
HOST_PID=$(
  VITE_RELAY_URL="ws://127.0.0.1:${RELAY_PORT}" \
  VITE_PHONE_URL="http://127.0.0.1:${PHONE_PORT}" \
  start_detached \
    "$REPO_ROOT/host" \
    "$RUN_DIR/host.log" \
    "$RUN_DIR/host.pid" \
    "$REPO_ROOT/host/node_modules/.bin/vite" \
    --config "$REPO_ROOT/host/vite.verify.config.js"
)
PHONE_PID=$(
  VITE_RELAY_URL="ws://127.0.0.1:${RELAY_PORT}" \
  start_detached \
    "$REPO_ROOT/phone" \
    "$RUN_DIR/phone.log" \
    "$RUN_DIR/phone.pid" \
    "$REPO_ROOT/phone/node_modules/.bin/vite" \
    --config "$REPO_ROOT/phone/vite.verify.config.js"
)

cat >"$RUN_DIR/instance.env" <<EOF
RELAY_PID=$RELAY_PID
HOST_PID=$HOST_PID
PHONE_PID=$PHONE_PID
RELAY_PORT=$RELAY_PORT
HOST_PORT=$HOST_PORT
PHONE_PORT=$PHONE_PORT
HOST_URL=http://127.0.0.1:${HOST_PORT}
PHONE_URL=http://127.0.0.1:${PHONE_PORT}
RELAY_URL=http://127.0.0.1:${RELAY_PORT}
REPO_ROOT=$REPO_ROOT
EOF

stop_started() {
  "$SCRIPT_DIR/cleanup.sh" || true
}

ready=0
for _ in $(seq 1 50); do
  relay_body=$(curl -sf "http://127.0.0.1:${RELAY_PORT}" || true)
  host_html=$(curl -sf "http://127.0.0.1:${HOST_PORT}" || true)
  phone_html=$(curl -sf "http://127.0.0.1:${PHONE_PORT}" || true)
  if [[ "$relay_body" == "ok" ]] \
    && [[ "$host_html" == *"Wii Bowling — Host"* ]] \
    && [[ "$phone_html" == *"Wii Bowling — Controller"* ]]; then
    ready=1
    break
  fi
  if ! kill -0 "$RELAY_PID" 2>/dev/null \
    || ! kill -0 "$HOST_PID" 2>/dev/null \
    || ! kill -0 "$PHONE_PID" 2>/dev/null; then
    echo "A verification process exited during startup."
    echo "--- relay ---"
    cat "$RUN_DIR/relay.log" || true
    echo "--- host ---"
    cat "$RUN_DIR/host.log" || true
    echo "--- phone ---"
    cat "$RUN_DIR/phone.log" || true
    stop_started
    exit 1
  fi
  sleep 0.2
done

if [[ "$ready" != 1 ]]; then
  echo "Timed out waiting for relay, host, and phone."
  echo "--- relay ---"
  cat "$RUN_DIR/relay.log" || true
  echo "--- host ---"
  cat "$RUN_DIR/host.log" || true
  echo "--- phone ---"
  cat "$RUN_DIR/phone.log" || true
  stop_started
  exit 1
fi

echo "Verification instance ready"
echo "HOST_URL=http://127.0.0.1:${HOST_PORT}"
echo "PHONE_URL=http://127.0.0.1:${PHONE_PORT}"
echo "RELAY_URL=http://127.0.0.1:${RELAY_PORT}"
echo "RELAY_PID=$RELAY_PID HOST_PID=$HOST_PID PHONE_PID=$PHONE_PID"
