#!/usr/bin/env bash
# Local-only end-to-end on a throwaway anvil node (chain id 31337). No keys: uses anvil's unlocked dev accounts.
# Flow: deploy factory → create vault → deposit → owner silent → guardians approve → execute → beneficiary paid.
set -euo pipefail
export PATH="$PATH:$HOME/.foundry/bin"
cd "$(dirname "$0")/../contracts"
PORT=18545; RPC=http://127.0.0.1:$PORT
anvil --port $PORT --silent & APID=$!
trap 'kill $APID 2>/dev/null || true' EXIT
for i in $(seq 1 30); do cast chain-id --rpc-url $RPC >/dev/null 2>&1 && break; sleep 0.3; done
ACCTS=($(cast rpc --rpc-url $RPC eth_accounts | tr '[],"' ' '))
OWNER=${ACCTS[0]}; HEIR=${ACCTS[1]}; G1=${ACCTS[2]}; G2=${ACCTS[3]}; G3=${ACCTS[4]}
echo "owner=$OWNER heir=$HEIR guardians=$G1 $G2 $G3"
FACT=$(forge script script/Deploy.s.sol --rpc-url $RPC --unlocked --sender $OWNER --broadcast 2>&1 | grep -oE "HeirloomFactory: 0x[0-9a-fA-F]{40}" | awk '{print $2}')
echo "factory=$FACT"
send() { cast send --rpc-url $RPC --unlocked "$@" >/dev/null; }
send --from $OWNER $FACT "create((address,address[],uint8,uint64,uint64,uint64,uint64))" "($HEIR,[$G1,$G2,$G3],2,2592000,604800,259200,2592000)"
VAULT=$(cast call --rpc-url $RPC $FACT "vaultsOf(address)(address[])" $OWNER | tr -d '[] ')
echo "vault=$VAULT"
send --from $OWNER $VAULT --value 5ether
echo "status (0=Active): $(cast call --rpc-url $RPC $VAULT 'status()(uint8)')"
cast rpc --rpc-url $RPC evm_increaseTime $((30*86400+7*86400+10)) >/dev/null; cast rpc --rpc-url $RPC evm_mine >/dev/null
echo "status after silence (2=AwaitingGuardians): $(cast call --rpc-url $RPC $VAULT 'status()(uint8)')"
BEFORE=$(cast balance --rpc-url $RPC $HEIR)
send --from $G1 $VAULT "approveRelease()"
send --from $G2 $VAULT "approveRelease()"
echo "status (3=Challenge): $(cast call --rpc-url $RPC $VAULT 'status()(uint8)')"
if cast send --rpc-url $RPC --unlocked --from $G3 $VAULT "executeRelease()" >/dev/null 2>&1; then echo "FAIL: early execute worked"; exit 1; else echo "early execute correctly reverted"; fi
cast rpc --rpc-url $RPC evm_increaseTime $((3*86400+1)) >/dev/null; cast rpc --rpc-url $RPC evm_mine >/dev/null
send --from $G3 $VAULT "executeRelease()"
AFTER=$(cast balance --rpc-url $RPC $HEIR)
echo "heir balance delta (wei): $((AFTER-BEFORE))"
[ "$((AFTER-BEFORE))" = "5000000000000000000" ] && echo "E2E PASS" || { echo "E2E FAIL"; exit 1; }
# agent's read-only chain adapter against the live local vault
cd ../agent && cat > /tmp/heirloom-read.mts <<'TS'
import { ViemChainReader } from "/workspace/deadman/agent/src/chain.ts";
import { status } from "/workspace/deadman/agent/src/chainModel.ts";
const s = await new ViemChainReader(process.env.RPC!).read(process.env.VAULT!);
console.log("ViemChainReader →", { released: s.released, threshold: s.threshold, guardianCount: s.guardianCount, intervalDays: s.intervalMs / 86400000, status: status(s, Date.now()) });
TS
VAULT=$VAULT RPC=$RPC npx tsx /tmp/heirloom-read.mts
