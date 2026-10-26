#!/usr/bin/env bash
# Runs every test suite + the web build. Local only.
set -euo pipefail
export PATH="$PATH:$HOME/.foundry/bin"
root="$(cd "$(dirname "$0")/.." && pwd)"
echo "── contracts (forge)";  (cd "$root/contracts" && forge test 2>&1 | grep -E "Suite result|tests passed|FAIL" )
echo "── local anvil e2e";    bash "$root/scripts/anvil-e2e.sh" 2>&1 | grep -E "E2E|reverted|ViemChainReader"
echo "── agent (vitest)";     (cd "$root/agent" && npx tsc --noEmit && npx vitest run 2>&1 | grep -E "Test Files|Tests|FAIL")
echo "── web sim (vitest)";   (cd "$root/web" && bash ../scripts/sync-model.sh >/dev/null && npx vitest run 2>&1 | grep -E "Test Files|Tests|FAIL")
echo "── web build";          (cd "$root/web" && npm run build 2>&1 | grep -E "Compiled|Generating static pages \(6/6\)|error|Error")
