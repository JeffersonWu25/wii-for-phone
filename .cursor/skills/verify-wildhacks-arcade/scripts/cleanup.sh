#!/usr/bin/env bash
# Stop the verification instance recorded in run/instance.env.
# Kills those PIDs and their children only. Leaves artifacts/ in place.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SKILL_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../../../.." && pwd)
RUN_DIR="$SKILL_DIR/run"
ENV_FILE="$RUN_DIR/instance.env"

remove_scaffolding() {
  rm -f "$REPO_ROOT/host/vite.verify.config.js" "$REPO_ROOT/phone/vite.verify.config.js"
}

if [[ ! -f "$ENV_FILE" ]]; then
  remove_scaffolding
  echo "No verification instance record at $ENV_FILE. Nothing to stop."
  exit 0
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

kill_tree() {
  local pid=$1
  [[ -n "${pid:-}" ]] || return 0
  kill -0 "$pid" 2>/dev/null || return 0
  local kids
  kids=$(pgrep -P "$pid" || true)
  for kid in $kids; do
    kill_tree "$kid"
  done
  kill "$pid" 2>/dev/null || true
}

kill_tree "${RELAY_PID:-}"
kill_tree "${HOST_PID:-}"
kill_tree "${PHONE_PID:-}"

for _ in $(seq 1 10); do
  alive=0
  for pid in "${RELAY_PID:-}" "${HOST_PID:-}" "${PHONE_PID:-}"; do
    [[ -n "$pid" ]] || continue
    if kill -0 "$pid" 2>/dev/null; then
      alive=1
    fi
  done
  [[ "$alive" == 0 ]] && break
  sleep 0.3
done

for pid in "${RELAY_PID:-}" "${HOST_PID:-}" "${PHONE_PID:-}"; do
  [[ -n "$pid" ]] || continue
  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null || true
  fi
done

rm -rf "$RUN_DIR"
remove_scaffolding

echo "Stopped verification instance pids ${RELAY_PID:-?} ${HOST_PID:-?} ${PHONE_PID:-?}."
echo "Removed host/vite.verify.config.js and phone/vite.verify.config.js."
echo "Proof artifacts under $SKILL_DIR/artifacts were left in place."
