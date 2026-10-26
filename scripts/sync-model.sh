#!/usr/bin/env bash
# Copies the agent's pure, dependency-free logic into the web app so the demo runs the SAME
# state machine + message engine as the real agent. Strips ".js" from relative imports for Next/webpack.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
src="$here/../agent/src"
dst="$here/../web/lib/agent"
mkdir -p "$dst"
for f in chainModel types engine explain wording; do
  { echo "// AUTO-COPIED from agent/src/$f.ts by scripts/sync-model.sh — do not edit here."; \
    sed -E "s#from \"(\./[A-Za-z]+)\.js\"#from \"\1\"#g" "$src/$f.ts"; } > "$dst/$f.ts"
done
echo "synced agent model → web/lib/agent"
