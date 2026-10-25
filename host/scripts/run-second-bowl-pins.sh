#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
bundle="scripts/.second-bowl-pins.bundle.mjs"
./node_modules/esbuild/bin/esbuild scripts/second-bowl-pins.test.mjs \
  --bundle --platform=node --format=esm \
  --outfile="$bundle" \
  --external:@dimforge/rapier3d-compat \
  --loader:.jsx=jsx
status=0
node "$bundle" || status=$?
rm -f "$bundle"
exit "$status"
