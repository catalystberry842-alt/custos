#!/usr/bin/env bash
# Copies the firewall's pure, dependency-free engine into the web app so the demo runs the SAME policy engine,
# simulator, threat checker and audit chain as the package. Strips ".js" from relative imports for Next/webpack.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
src="$here/../firewall/src"
dst="$here/../web/lib/firewall"
rm -rf "$dst"; mkdir -p "$dst"
for f in "$src"/*.ts; do
  b="$(basename "$f")"
  { echo "// AUTO-COPIED from firewall/src/$b by scripts/sync-firewall.sh — do not edit here."; \
    sed -E "s#from \"(\./[A-Za-z0-9]+)\.js\"#from \"\1\"#g" "$f"; } > "$dst/$b"
done
echo "synced firewall engine → web/lib/firewall"
