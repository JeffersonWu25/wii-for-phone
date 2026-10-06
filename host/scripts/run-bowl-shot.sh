#!/bin/sh
set -e
cd "$(dirname "$0")/.."
bundle="scripts/.bowl-shot.bundle.mjs"
./node_modules/esbuild/bin/esbuild scripts/bowl-shot.test.mjs \
  --bundle --platform=node --format=esm \
  --outfile="$bundle" \
  --external:@dimforge/rapier3d-compat \
  --loader:.jsx=jsx
status=0
node "$bundle" || status=$?
rm -f "$bundle"
exit $status
