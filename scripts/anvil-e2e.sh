#!/usr/bin/env bash
# Local-only end-to-end on a throwaway anvil node (chain id 31337 by default; E2E_CHAIN_ID=46630 mimics Robinhood testnet
# and uses script/DeployRobinhood.s.sol, whose chain guard accepts 4663/46630/31337/1337). No keys: uses anvil's unlocked dev accounts.
# Flow: deploy factory → create vault → deposit → owner silent → guardians approve → execute → beneficiary paid.
set -euo pipefail
export PATH="$PATH:$HOME/.foundry/bin"
cd "$(dirname "$0")/../contracts"
PORT=18545; RPC=http://127.0.0.1:$PORT
CID=${E2E_CHAIN_ID:-31337}
SCRIPT=script/Deploy.s.sol; [ "$CID" = 31337 ] || SCRIPT=script/DeployRobinhood.s.sol
anvil --port $PORT --chain-id $CID --silent & APID=$!
trap 'kill $APID 2>/dev/null || true' EXIT
for i in $(seq 1 30); do cast chain-id --rpc-url $RPC >/dev/null 2>&1 && break; sleep 0.3; done
ACCTS=($(cast rpc --rpc-url $RPC eth_accounts | tr '[],"' ' '))
OWNER=${ACCTS[0]}; HEIR=${ACCTS[1]}; G1=${ACCTS[2]}; G2=${ACCTS[3]}; G3=${ACCTS[4]}
echo "chain-id=$(cast chain-id --rpc-url $RPC) script=$SCRIPT"
echo "owner=$OWNER heir=$HEIR guardians=$G1 $G2 $G3"
FACT=$(forge script $SCRIPT --rpc-url $RPC --unlocked --sender $OWNER --broadcast 2>&1 | grep -oE "CustosFactory: 0x[0-9a-fA-F]{40}" | awk '{print $2}')
echo "factory=$FACT"
send() { cast send --rpc-url $RPC --unlocked "$@" >/dev/null; }
send --from $OWNER $FACT "create((address,address[],uint8,uint64,uint64,uint64,uint64))" "($HEIR,[$G1,$G2,$G3],2,2592000,604800,259200,2592000)"
VAULT=$(cast call --rpc-url $RPC $FACT "vaultsOf(address)(address[])" $OWNER | tr -d '[] ')
echo "vault=$VAULT"
send --from $OWNER $VAULT --value 5ether
echo "status (0=Active): $(cast call --rpc-url $RPC $VAULT 'status()(uint8)')"
# Robinhood Chain: block.number is an L1 estimate, so MANY blocks without time passing must not move any deadline
cast rpc --rpc-url $RPC anvil_mine 0x186a0 >/dev/null   # 100,000 blocks
echo "status after 100k blocks, no time (still 0=Active): $(cast call --rpc-url $RPC $VAULT 'status()(uint8)')"
[ "$(cast call --rpc-url $RPC $VAULT 'status()(uint8)')" = 0 ] || { echo "E2E FAIL: block count moved the timer"; exit 1; }
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
# ── AI-agent layer (local): owner authorises an agent key within limits; agent spends; silence freezes it; guardians hand over
echo "── agent layer"
AG=${ACCTS[5]}; VENDOR=${ACCTS[6]}; SUCC=${ACCTS[7]}
send --from $OWNER $FACT "create((address,address[],uint8,uint64,uint64,uint64,uint64))" "($HEIR,[$G1,$G2,$G3],2,2592000,604800,259200,2592000)"
V2=$(cast call --rpc-url $RPC $FACT "vaultsOf(address)(address[])" $OWNER | tr -d '[] ' | awk -F, '{print $NF}')
send --from $OWNER $V2 --value 10ether
send --from $OWNER $V2 "setAgent(address,uint64,uint64)" $AG 86400 604800
send --from $OWNER $V2 "setAssetLimit(address,uint128,uint128)" 0x0000000000000000000000000000000000000000 1000000000000000000 2000000000000000000
send --from $OWNER $V2 "setRecipient(address,bool)" $VENDOR true
send --from $OWNER $V2 "setSuccessor(address)" $SUCC
echo "agent state (1=Active): $(cast call --rpc-url $RPC $V2 'agentState()(uint8)')"
VB=$(cast balance --rpc-url $RPC $VENDOR)
send --from $AG $V2 "agentSpend(address,address,uint256)" 0x0000000000000000000000000000000000000000 $VENDOR 1000000000000000000
[ "$(( $(cast balance --rpc-url $RPC $VENDOR) - VB ))" = "1000000000000000000" ] && echo "agent spend within limit: OK" || { echo "E2E FAIL: agent spend"; exit 1; }
if cast send --rpc-url $RPC --unlocked --from $AG $V2 "agentSpend(address,address,uint256)" 0x0000000000000000000000000000000000000000 $VENDOR 1000000000000000001 >/dev/null 2>&1; then echo "E2E FAIL: over-limit spend worked"; exit 1; else echo "over-limit spend correctly reverted"; fi
if cast send --rpc-url $RPC --unlocked --from $AG $V2 "withdrawNative(uint256)" 1 >/dev/null 2>&1; then echo "E2E FAIL: agent withdrew"; exit 1; else echo "agent cannot call owner functions: OK"; fi
cast rpc --rpc-url $RPC evm_increaseTime $((30*86400+7*86400+10)) >/dev/null; cast rpc --rpc-url $RPC evm_mine >/dev/null
echo "agent state after owner silence (4=FrozenLapsed): $(cast call --rpc-url $RPC $V2 'agentState()(uint8)')"
if cast send --rpc-url $RPC --unlocked --from $AG $V2 "agentSpend(address,address,uint256)" 0x0000000000000000000000000000000000000000 $VENDOR 1 >/dev/null 2>&1; then echo "E2E FAIL: frozen agent spent"; exit 1; else echo "frozen agent correctly blocked"; fi
send --from $G1 $V2 "approveOutcome(uint8)" 1
send --from $G2 $V2 "approveOutcome(uint8)" 1
cast rpc --rpc-url $RPC evm_increaseTime $((3*86400+1)) >/dev/null; cast rpc --rpc-url $RPC evm_mine >/dev/null
send --from $G3 $V2 "executeRelease()"
NEWOWNER=$(cast call --rpc-url $RPC $V2 "owner()(address)")
[ "$(echo $NEWOWNER | tr A-F a-f)" = "$(echo $SUCC | tr A-F a-f)" ] && echo "handover to successor: OK (funds stay in vault: $(cast balance --rpc-url $RPC $V2) wei)" || { echo "E2E FAIL: handover"; exit 1; }
echo "AGENT E2E PASS"
# agent's read-only chain adapter against the live local vault
cd ../agent && cat > /tmp/custos-read.mts <<'TS'
import { ViemChainReader } from "/workspace/deadman/agent/src/chain.ts";
import { status } from "/workspace/deadman/agent/src/chainModel.ts";
const s = await new ViemChainReader(process.env.RPC!).read(process.env.VAULT!);
console.log("ViemChainReader →", { released: s.released, threshold: s.threshold, guardianCount: s.guardianCount, intervalDays: s.intervalMs / 86400000, status: status(s, Date.now()) });
TS
VAULT=$VAULT RPC=$RPC npx tsx /tmp/custos-read.mts
