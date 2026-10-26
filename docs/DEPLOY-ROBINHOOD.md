# Deploying Heirloom to Robinhood Chain (testnet first, then mainnet)

> **Status: instructions only. This project has NOT deployed anything to any live network.** The repo's rules: no
> pushing, no deploying, no keys. Everything below is for **you** to run yourself, from **your** machine, with a signer
> **you** control. Nothing here should ever be pasted into a chat. Not a private key, not a seed phrase, not a keystore
> password. Heirloom is **unaudited**; do not put real value in it before an independent audit.

Facts below were checked against the official docs on 2026-10-26:
[Connecting](https://docs.robinhood.com/chain/connecting/),
[Deploy a contract](https://docs.robinhood.com/chain/deploy-smart-contracts/),
[Differences from Ethereum](https://docs.robinhood.com/chain/differences-from-ethereum/),
[Bridging](https://docs.robinhood.com/chain/bridging/).
Re-check them before you deploy; networks change.

| | Testnet | Mainnet |
|---|---|---|
| Chain ID | **46630** (`0xb626`) | **4663** (`0x1237`) |
| Native gas token | ETH (no value on testnet) | ETH |
| Public RPC (rate-limited, "not for production") | `https://rpc.testnet.chain.robinhood.com` | `https://rpc.mainnet.chain.robinhood.com` |
| Recommended provider RPC | Alchemy `https://robinhood-testnet.g.alchemy.com/v2/<KEY>` | Alchemy `https://robinhood-mainnet.g.alchemy.com/v2/<KEY>` (also Chainstack, QuickNode, …) |
| Explorer (Blockscout) | `https://explorer.testnet.chain.robinhood.com` | `https://robinhoodchain.blockscout.com` |
| Verifier API | `https://explorer.testnet.chain.robinhood.com/api/` | `https://robinhoodchain.blockscout.com/api/` |
| Faucet | <https://faucet.testnet.chain.robinhood.com> (official), Alchemy's faucet as a backup | n/a, bridge real ETH (see §6) |

> Note the **testnet explorer is a different host** (`explorer.testnet.chain.robinhood.com`), not
> `robinhoodchain.blockscout.com`. Use the right verifier URL per network.
> Never put an API key into a file in this repo; pass a provider URL only on the command line / in your shell.

## 0. How Robinhood Chain differs (and what Heirloom already does about it)

| Difference ([source](https://docs.robinhood.com/chain/differences-from-ethereum/)) | Heirloom |
|---|---|
| `block.number` = **estimate of the L1 block number**, updates only periodically | Never read. All timing is `block.timestamp`. Tests in `contracts/test/RobinhoodChain.t.sol` roll block numbers by huge amounts (forwards, backwards, frozen) and prove no deadline moves; a test also greps `src/` for `block.number`, `prevrandao`, `difficulty`, `blockhash(`, `block.coinbase`, `tx.origin`, `ArbSys`, `gasleft(`. |
| `block.prevrandao` / `difficulty` constant | Not used. |
| `blockhash`, `block.coinbase` (= fee account) | Not used. |
| 96 KB code limit (24 KB on Ethereum) | Heirloom ≈ 13.8 KB, factory ≈ 17.4 KB: well below even Ethereum's limit, so the same bytecode is portable. |
| Gas = L2 execution + L1 data fee; `gasleft()`/estimation differ | `gasleft()` unused. The only gas numbers are fixed per-transfer caps (`TRANSFER_GAS` = 300 000) in the release loop. Check real release gas on testnet (§3, step 6). If `forge script` under-estimates, add `--gas-estimate-multiplier 200`. |
| Aliased `msg.sender` for L1→L2 messages | Owner/guardian/beneficiary checks are by exact address; `tx.origin` is never used. A guardian that is an **L1 contract** must be entered as its **aliased L2 address** (or just use an EOA / L2 smart account). |
| ERC-4337 smart accounts are first class | Contracts are accepted as owner, guardian and beneficiary (tested). |
| Sequencer screening of sanctioned addresses | A blocked transaction is simply never included. Heirloom's owner/guardian/beneficiary flows could be affected for a sanctioned address; nothing to code, but disclose in your terms. |
| First-come-first-served ordering, no priority fees | Nothing relies on ordering. |
| 7-day withdrawal challenge period to Ethereum | Relevant for how users fund/exit via the canonical bridge, not for the contracts. |
| EVM version | Built with `evm_version = "cancun"`. The docs do not state the supported EVM version; the testnet deploy in §3 is how you confirm it. If it ever fails with an invalid opcode, rebuild with `--evm-version shanghai` and re-run the whole test suite before re-deploying. |

## 1. Pre-deploy checklist (do NOT skip for mainnet)

- [ ] `bash scripts/test-all.sh` is green on the exact commit you deploy (forge, agent, web, local anvil e2e, build).
- [ ] **Independent smart-contract audit** completed; every high/medium finding fixed; the audited commit hash is the one you deploy (`git rev-parse HEAD`). Heirloom has **no admin and no upgrade path**: a bug in a deployed vault cannot be patched.
- [ ] **Testnet soak** of at least 2-4 weeks (§3): real vaults, a *complete* release cycle (needs ≥ 3 days with the minimum timings 1d/1d/1d), a cancel-by-check-in cycle, a hostile-token sweep, the agent running against the testnet RPC.
- [ ] Gas for a worst-case release (many tokens) measured on testnet; documented.
- [ ] Re-read the official [Differences from Ethereum](https://docs.robinhood.com/chain/differences-from-ethereum/) and [Connecting](https://docs.robinhood.com/chain/connecting/) pages; confirm chain id, RPC and explorer have not changed.
- [ ] Deployer is a **hardware wallet** (`--ledger`) or an encrypted keystore on a clean machine; never a key in a `.env` file, shell history, a repo or a chat.
- [ ] A dedicated deployer address with only enough ETH for gas; it has **no special rights** over the factory afterwards (the factory has no owner).
- [ ] Pinned compiler: `solc 0.8.26`, optimizer 200 runs (see `contracts/foundry.toml`). Record the exact `forge --version`.
- [ ] Terms/legal reviewed for your jurisdictions; the UI keeps the "unaudited" notice until the audit is public.
- [ ] You read the dry-run output (§2) and the chain-id check printed `chainid: 4663` for mainnet.

## 2. One-time setup on your machine

```bash
# Foundry (https://book.getfoundry.sh)
curl -L https://foundry.paradigm.xyz | bash && foundryup
git clone <your copy of this repo> && cd deadman/contracts && forge build && forge test
```

Create your **encrypted keystore** (you type the key/password into *your own terminal*; this stays on your disk):

```bash
cast wallet import heirloom-test --interactive     # prompts for the private key and a password
cast wallet list
cast wallet address --account heirloom-test        # your public deployer address
```

Or use a Ledger (`--ledger`, with the Ethereum app open and "blind signing"/contract data enabled).
The scripts below **refuse** `--private-key`, `--mnemonic*` and a `PRIVATE_KEY` environment variable.

## 3. Testnet (chain 46630)

```bash
# Safe shell for the session (optional: a provider URL with your own key, never committed)
export RH_RPC_URL=https://rpc.testnet.chain.robinhood.com     # or your Alchemy/QuickNode testnet URL
export DEPLOYER=$(cast wallet address --account heirloom-test)
```

**Step 1. Get testnet ETH.** Open <https://faucet.testnet.chain.robinhood.com>, paste `$DEPLOYER` (public address) and
request tokens. Backup: <https://www.alchemy.com/faucets/robinhood-testnet> (0.1 ETH / 24 h; wallet must meet its
mainnet-activity eligibility rules). Check:

```bash
cast chain-id --rpc-url $RH_RPC_URL          # must print 46630
cast balance $DEPLOYER --rpc-url $RH_RPC_URL --ether
```

**Step 2. Dry-run (simulation only, nothing signed or sent).**

```bash
cd contracts
../scripts/deploy-robinhood.sh testnet --sender $DEPLOYER --rpc-url $RH_RPC_URL
# equivalent raw forge: forge script script/DeployRobinhood.s.sol:DeployRobinhood --rpc-url $RH_RPC_URL --chain-id 46630 --sender $DEPLOYER
```

Read the output: `chainid: 46630`, `target: Robinhood Chain TESTNET`, the estimated gas and cost.

**Step 3. Deploy (real testnet transaction; testnet ETH only).**

```bash
../scripts/deploy-robinhood.sh testnet --account heirloom-test --rpc-url $RH_RPC_URL --broadcast
# Ledger instead:  ../scripts/deploy-robinhood.sh testnet --ledger --rpc-url $RH_RPC_URL --broadcast
```

You'll be asked to type `deploy testnet`, then forge asks for the keystore password (or your Ledger asks you to
confirm). Note the printed `HeirloomFactory: 0x…`; it is also saved in `contracts/broadcast/DeployRobinhood.s.sol/46630/run-latest.json` (git-ignored).
If forge reports a gas/"intrinsic gas" problem (Arbitrum gas accounting), re-run with
`forge script … --gas-estimate-multiplier 200` (see `forge script --help`).

**Step 4. Verify on the explorer** (see §5): `FACTORY=0x…`.

**Step 5. Smoke test with a throwaway vault** (all values are examples; use your own addresses; use *real separate*
test addresses for beneficiary/guardians):

```bash
export FACTORY=0x...   # from step 3
# params = (beneficiary, guardians[], threshold, interval, grace, challengeWindow, fallbackDelay), all seconds
cast send $FACTORY "create((address,address[],uint8,uint64,uint64,uint64,uint64))" \
  "(0xBENEFICIARY,[0xG1,0xG2,0xG3],2,86400,86400,86400,0)" \
  --account heirloom-test --rpc-url $RH_RPC_URL
cast call $FACTORY "vaultsOf(address)(address[])" $DEPLOYER --rpc-url $RH_RPC_URL
VAULT=0x...            # last item of the list
cast send $VAULT --value 0.001ether --account heirloom-test --rpc-url $RH_RPC_URL     # deposit test ETH
cast call $VAULT "status()(uint8)" --rpc-url $RH_RPC_URL                               # 0 = Active
cast send $VAULT "checkIn()" --account heirloom-test --rpc-url $RH_RPC_URL
```

Minimum timings are 1 day each, so the full release path (silence → guardians vote → challenge → execute) takes
≥ 3 days on a live chain. Run it for real at least once; also run a cancel-by-check-in cycle.

**Step 6. Measure release gas** with the vault holding several test ERC-20s; record the gas used by `executeRelease()`.

**Step 7. Point the agent (read-only) at testnet.**

```bash
HEIRLOOM_RPC_URL=$RH_RPC_URL npm --prefix ../agent start     # mode=chain; the agent never holds keys
```

**Step 8. Soak.** Keep vaults + agent running for the soak period; log every anomaly; fix → re-test → *re-deploy a new factory* (no upgrades exist).

## 4. Mainnet (chain 4663): only after §1 is fully ticked

```bash
export RH_RPC_URL=https://rpc.mainnet.chain.robinhood.com      # or your provider URL
export DEPLOYER=0xYourHardwareWalletAddress
cast chain-id --rpc-url $RH_RPC_URL                            # must print 4663
cast balance $DEPLOYER --rpc-url $RH_RPC_URL --ether           # real ETH for gas, bridged per §6

# 1) Dry-run, always first
cd contracts && ../scripts/deploy-robinhood.sh mainnet --sender $DEPLOYER --rpc-url $RH_RPC_URL

# 2) Real deployment: hardware wallet; the explicit env flag + typed confirmation are deliberate speed bumps
HEIRLOOM_MAINNET_OK=yes ../scripts/deploy-robinhood.sh mainnet --ledger --rpc-url $RH_RPC_URL --broadcast
```

The Solidity script itself also refuses chain 4663 unless `HEIRLOOM_MAINNET_OK=yes`, and refuses every chain other than
Robinhood testnet/mainnet and local dev chains (31337/1337). Afterwards, verify (§5), re-run the smoke test with a tiny
amount, publish the factory address + audited commit hash, and only then enable the "Real chain" panel for users.

## 5. Verify the source on Blockscout

`forge` accepts the explorer as a Blockscout verifier (no API key; the docs use a placeholder). Pass the verifier
**explicitly on the CLI** (foundry's `[etherscan]` table can't express the verifier type).

```bash
cd contracts
# testnet
forge verify-contract $FACTORY src/HeirloomFactory.sol:HeirloomFactory \
  --chain-id 46630 --rpc-url https://rpc.testnet.chain.robinhood.com \
  --verifier blockscout --verifier-url https://explorer.testnet.chain.robinhood.com/api/ --watch
# mainnet
forge verify-contract $FACTORY src/HeirloomFactory.sol:HeirloomFactory \
  --chain-id 4663 --rpc-url https://rpc.mainnet.chain.robinhood.com \
  --verifier blockscout --verifier-url https://robinhoodchain.blockscout.com/api/ --watch
```

Or add `--verify` to `scripts/deploy-robinhood.sh … --broadcast` to verify during deployment.

Vaults are created by the factory, so verify the `Heirloom` source once against a real vault (constructor args = owner + params):

```bash
ARGS=$(cast abi-encode "constructor(address,(address,address[],uint8,uint64,uint64,uint64,uint64))" \
  $DEPLOYER "(0xBENEFICIARY,[0xG1,0xG2,0xG3],2,86400,86400,86400,0)")
forge verify-contract $VAULT src/Heirloom.sol:Heirloom --chain-id 46630 --constructor-args $ARGS \
  --verifier blockscout --verifier-url https://explorer.testnet.chain.robinhood.com/api/ --watch
```

If CLI verification is blocked (the mainnet Blockscout sits behind bot protection that can reject non-browser clients),
use the explorer's **Verify & publish** page with the *Solidity (Standard JSON input)* option:
`forge verify-contract --show-standard-json-input $FACTORY src/HeirloomFactory.sol:HeirloomFactory > std.json` (compiler 0.8.26, optimizer 200, EVM cancun).

Check: `https://<explorer>/address/<FACTORY>` shows a green check and the source; compare the bytecode hash with your local build.

## 6. Mainnet funding notes

Bridge ETH (and supported stablecoins) with the [Arbitrum canonical bridge](https://docs.robinhood.com/chain/bridging/)
(deposit ≈ 10 min; **withdrawal ≈ 7 days** challenge period) or a partner route (LayerZero, CCIP, Relay, Across…). A bridged ERC-20's L2
address differs from its L1 address, so look it up from the docs / `calculateL2TokenAddress`; **never copy a token address from a chat or social
post**. Before whitelisting a stablecoin in a vault (`addToken`), confirm its L2 address from the issuer's official documentation.

## 7. If something goes wrong

* **Wrong chain / RPC mismatch:** the wrapper compares `eth_chainId` to the target and aborts; the script re-checks `block.chainid`.
* **Deploy tx stuck / failed:** nothing is half-deployed (single `CREATE`). Re-run the dry-run; check balance and gas price; retry.
* **A bug in a deployed vault:** there is no admin. Owners withdraw or `closeVault()` (while alive); publish an advisory; deploy a fixed factory; users migrate.
* **Key suspicion:** deployer key has no powers after deployment; rotating it is unnecessary but harmless.
