#!/usr/bin/env bash
# Custos factory deploy helper for Robinhood Chain (testnet 46630 / mainnet 4663).
#
#   DRY-RUN is the DEFAULT: forge only SIMULATES, nothing is signed or sent.
#   Real send needs --broadcast AND a typed confirmation.
#
# SIGNER: ONLY from the forge CLI, i.e. `--account <keystore name>` (created with `cast wallet import`) or `--ledger`.
# This script never reads, stores or accepts a private key: `--private-key` and PRIVATE_KEY in the environment are refused.
# A dry-run may use `--sender 0xYourPublicAddress` (public address only, no signing).
#
# Examples
#   scripts/deploy-robinhood.sh testnet --sender 0xYourAddr                       # simulate on testnet
#   scripts/deploy-robinhood.sh testnet --account custos-test --broadcast       # real testnet deploy (prompts for keystore password via forge)
#   scripts/deploy-robinhood.sh testnet --ledger --broadcast --verify
#   CUSTOS_MAINNET_OK=yes scripts/deploy-robinhood.sh mainnet --ledger --broadcast --verify   # ONLY after the checklist
set -euo pipefail
export PATH="$PATH:$HOME/.foundry/bin"
cd "$(dirname "$0")/../contracts"

die() { echo "error: $*" >&2; exit 1; }
net="${1:-}"; shift || true
case "$net" in
  testnet) CHAIN_ID=46630; RPC="https://rpc.testnet.chain.robinhood.com"; EXPLORER_API="https://explorer.testnet.chain.robinhood.com/api/"; EXPLORER="https://explorer.testnet.chain.robinhood.com";;
  mainnet) CHAIN_ID=4663;  RPC="https://rpc.mainnet.chain.robinhood.com"; EXPLORER_API="https://robinhoodchain.blockscout.com/api/";       EXPLORER="https://robinhoodchain.blockscout.com";;
  *) die "usage: $0 <testnet|mainnet> (--account NAME | --ledger | --sender 0xADDR[dry-run only]) [--rpc-url URL] [--broadcast] [--verify]";;
esac

[ -z "${PRIVATE_KEY:-}" ] || die "PRIVATE_KEY is set in your environment. Unset it. This project never uses raw private keys (use --account or --ledger)."
signer=(); signer_kind=""; broadcast=0; verify=0; sender=""
while [ $# -gt 0 ]; do
  case "$1" in
    --private-key|--private-keys|--mnemonic*|--interactives|--keystore) die "refused: raw key material flags are not allowed. Use --account <name> or --ledger.";;
    --account) [ $# -ge 2 ] || die "--account needs a keystore name"; signer=(--account "$2"); signer_kind="account"; shift 2;;
    --ledger) signer=(--ledger); signer_kind="ledger"; shift;;
    --sender) [ $# -ge 2 ] || die "--sender needs an address"; sender="$2"; shift 2;;
    --rpc-url) [ $# -ge 2 ] || die "--rpc-url needs a URL"; RPC="$2"; shift 2;;
    --broadcast) broadcast=1; shift;;
    --verify) verify=1; shift;;
    *) die "unknown argument: $1";;
  esac
done

if [ "$broadcast" = 1 ]; then
  [ -n "$signer_kind" ] || die "--broadcast needs --account <keystore> or --ledger"
  [ -z "$sender" ] || die "--sender is for dry-runs only"
else
  [ -n "$signer_kind$sender" ] || die "dry-run needs --sender 0xYourPublicAddress (or --account/--ledger)"
fi
if [ "$net" = mainnet ] && [ "$broadcast" = 1 ] && [ "${CUSTOS_MAINNET_OK:-}" != "yes" ]; then
  die "mainnet broadcast needs CUSTOS_MAINNET_OK=yes (confirm you completed docs/DEPLOY-ROBINHOOD.md checklist: audit + testnet soak)."
fi

echo "network: Robinhood Chain $net (expected chain id $CHAIN_ID)  rpc: $RPC"
got=$(cast chain-id --rpc-url "$RPC") || die "cannot reach RPC"
[ "$got" = "$CHAIN_ID" ] || die "RPC reports chain id $got, expected $CHAIN_ID. Refusing."

args=(script script/DeployRobinhood.s.sol:DeployRobinhood --rpc-url "$RPC" --chain-id "$CHAIN_ID")
[ -z "$sender" ] || args+=(--sender "$sender")
[ "${#signer[@]}" -eq 0 ] || args+=("${signer[@]}")

if [ "$broadcast" = 0 ]; then
  echo "DRY-RUN (simulation only; nothing is signed or sent). Add --broadcast to really deploy."
  forge "${args[@]}"
  exit 0
fi

echo "About to BROADCAST a real transaction on Robinhood Chain $net with signer: $signer_kind."
echo "It costs real gas ($([ "$net" = mainnet ] && echo 'real ETH' || echo 'testnet ETH')). Type exactly:  deploy $net"
read -r ans; [ "$ans" = "deploy $net" ] || die "not confirmed; aborting (nothing sent)."
args+=(--broadcast)
[ "$verify" = 0 ] || args+=(--verify --verifier blockscout --verifier-url "$EXPLORER_API" --etherscan-api-key empty)
forge "${args[@]}"
echo "Done. Look the address up at $EXPLORER and follow docs/DEPLOY-ROBINHOOD.md §5 (verify) if you did not pass --verify."
