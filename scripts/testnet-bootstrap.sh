#!/usr/bin/env bash
# Creates the DEMO vault on Robinhood Chain TESTNET (46630) after the factory is deployed, and records every tx hash.
# Signer = a throwaway testnet-only foundry keystore (never mainnet). Reads the keystore/password FILES; never prints them.
# Usage: FACTORY=0x... scripts/testnet-bootstrap.sh
set -euo pipefail
export PATH="$PATH:$HOME/.foundry/bin"
RPC=https://rpc.testnet.chain.robinhood.com
SEC=/home/box/secrets
KS=(--keystore "$SEC/keystore/custos-testnet" --password-file "$SEC/custos-testnet.pw")
addr() { cast wallet address --keystore "$SEC/keystore/custos-$1" --password-file "$SEC/custos-testnet.pw"; }
[ "$(cast chain-id --rpc-url $RPC)" = 46630 ] || { echo "not chain 46630"; exit 1; }
: "${FACTORY:?set FACTORY}"
OWNER=$(cast wallet address "${KS[@]}")
AGENT=$(addr agent); G1=$(addr guardian1); G2=$(addr guardian2); ACME=$(addr acme); RENT=$(addr landlord); BEN=$(addr beneficiary)
OUT=/workspace/deadman/docs/testnet-deployment.json
tx() { local label="$1"; shift; local h; h=$(cast send --json --rpc-url $RPC "${KS[@]}" "$@" | python3 -c 'import sys,json;print(json.load(sys.stdin)["transactionHash"])'); echo "$label $h" | tee -a /tmp/bootstrap-txs.log; }
: > /tmp/bootstrap-txs.log
tx createVault "$FACTORY" "create((address,address[],uint8,uint64,uint64,uint64,uint64))" "($BEN,[$G1,$G2],2,86400,86400,86400,0)"
VAULT=$(cast call "$FACTORY" "vaultsOf(address)(address[])" "$OWNER" --rpc-url $RPC | tr -d '[] ' | tr ',' '\n' | tail -1)
echo "vault $VAULT"
tx setAgent "$VAULT" "setAgent(address,uint64,uint64)" "$AGENT" 3600 86400
tx setAssetLimit_ETH "$VAULT" "setAssetLimit(address,uint128,uint128)" 0x0000000000000000000000000000000000000000 500000000000000 2000000000000000
tx setRecipient_acme "$VAULT" "setRecipient(address,bool)" "$ACME" true
tx setRecipient_landlord "$VAULT" "setRecipient(address,bool)" "$RENT" true
tx setAgentCallQuota "$VAULT" "setAgentCallQuota(uint32)" 5
tx depositVault "$VAULT" --value 0.004ether
tx fundAgentGas "$AGENT" --value 0.002ether
echo "{\"vault\":\"$VAULT\"}" > /tmp/bootstrap-vault.json
echo done
