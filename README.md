# Custos

> **A guardian for your AI agent.** A dead-man's switch for AI agents and their owners.  <!-- name + tagline: see docs/BRAND.md -->

Custos is **security and custody tooling**: a **non-custodial dead-man's switch** designed for **Robinhood Chain** (an Arbitrum Orbit L2,
mainnet chain id 4663, testnet 46630, ETH gas).

* **For AI agents.** Your AI agent holds a wallet/budget through the vault, with hard limits enforced by the contract: per-payment and
  per-period caps, an allowlist of payees and tokens. Keep checking in and it works. **If you go silent, the agent freezes by itself**, so it
  can't keep spending unattended or get stuck. Guardians you chose can then freeze it, **hand the funds and permissions to a successor you named**,
  or **shut it down and return the funds to your beneficiary**. They can never pick a new destination.
* **For people.** Skip the agent and it is plain crypto inheritance: N-of-M guardians can release the vault to the beneficiary you chose,
  after a final challenge window in which one check-in cancels everything.

**Live simulation demo:** https://custos-peach.vercel.app (fake time, funds and AI; nothing on-chain).

There is **no token** and nothing in this repo makes any claim about price or returns.

> ⚠️ **MVP, unaudited, never deployed.** Everything here runs locally. No testnet or mainnet deployment, no token, no real funds,
> no keys. Do not put real value in these contracts before an independent audit.

| Part | Where | What |
|---|---|---|
| Smart contracts | [`contracts/`](contracts) | `Custos` (per-owner vault with the AI-agent layer), `CustosFactory`, `IGuardianStaking` stub. Foundry. |
| Check-in assistant | [`agent/`](agent) | Node/TypeScript: the face of the product. Deterministic scheduler + escalation, **watches the managed AI agent (mock adapter) and tells the owner in plain language** when it spends, nears a limit, is blocked or frozen; adapters (mock/console/Telegram), LLM *wording only* with a rules fallback, web check-in link server. |
| Demo web app | [`web/`](web) | Next.js: landing, setup wizard (incl. **Your AI agent** step), dashboard with agent activity, budget, FROZEN state and guardian actions, **Fast-forward time** simulation (clearly labelled), optional viem wallet panel. |
| Docs | [`PLAN.md`](PLAN.md), [`docs/BRAND.md`](docs/BRAND.md), [`docs/DEPLOY-ROBINHOOD.md`](docs/DEPLOY-ROBINHOOD.md), [`docs/token-design.md`](docs/token-design.md) | Architecture + threat model; **step-by-step Robinhood Chain deploy/verify guide + checklist** (instructions only); optional token design (not implemented). |
| Screenshots | [`shots/`](shots) | Mobile 390×844 and desktop. |

## Quick start

Requirements: Node ≥ 20, Foundry (`forge`, `anvil`).

```bash
# everything: contract tests, local anvil e2e, agent tests, web tests, web build
bash scripts/test-all.sh

# 1) contracts  (forge-std is vendored in contracts/lib; or: forge install foundry-rs/forge-std --no-git)
cd contracts && forge test            # 158 tests (unit, scenario, fuzz, reentrancy, hostile tokens, AI-agent layer, Robinhood-chain timing)
forge coverage --report summary       # 100% lines on src/Custos.sol and the factory

# 2) agent (no credentials needed)
cd agent && npm install
npm run demo                          # simulated 60-day story, mock channels, fake clock
npm run demo -- --scenario return     # owner comes back during the challenge window
npm run demo -- --scenario late       # owner answers late in the grace period
npm run demo:agent                    # AI agent pays, gets blocked, owner goes silent → frozen → guardians hand over to the successor
npm run demo:agent-return             # …but the owner returns, and the agent is unfrozen
npm test                              # 60 tests
npm start                             # real clock + tiny check-in web server on :8787 (console channel)

# 3) web demo
cd web && npm install
npm run dev                           # http://localhost:3100  (or: npm run build && npm start)
node scripts/shots.mjs http://localhost:3100 ../shots   # regenerate screenshots (needs playwright's chromium)

# 4) local chain e2e (throwaway anvil, unlocked dev accounts, no keys)
bash scripts/anvil-e2e.sh                       # chain 31337
E2E_CHAIN_ID=46630 bash scripts/anvil-e2e.sh    # local anvil posing as Robinhood testnet (uses script/DeployRobinhood.s.sol)

# 5) Robinhood Chain: DRY-RUN ONLY unless YOU choose to deploy (see docs/DEPLOY-ROBINHOOD.md)
bash scripts/deploy-robinhood.sh testnet --sender 0xYourPublicAddress   # simulation; --account <keystore> or --ledger for a real send
```

Renaming the product: `bash scripts/rename-product.sh <Name>` (see [`docs/BRAND.md`](docs/BRAND.md)).

Optional environment (see `.env.example`): `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `CUSTOS_LINK_SECRET`,
`CUSTOS_STATE`, `CUSTOS_RPC_URL` (Robinhood RPC, read-only). **None are needed**; with none set, the agent runs in mock mode with rules-based wording.

## How it works

### The AI-agent layer (the point of the product)

```
owner alive (checks in)          owner silent past the deadline        guardians (N of M), after grace + challenge
┌────────────────────────┐       ┌───────────────────────────┐        ┌──────────────────────────────────────────┐
│ agent spends inside    │  ───▶ │ agent FROZEN automatically │  ───▶ │ Handover → successor the owner named     │
│ per-tx / per-period    │       │ (owner returns: unfrozen)  │        │ Shutdown → funds to the owner's beneficiary│
│ caps, allowlisted payees│       │ any guardian may freeze too│        │ (guardians never choose a destination)   │
└────────────────────────┘       └───────────────────────────┘        └──────────────────────────────────────────┘
```

* **The agent key** is the AI's operator/session key (one `agent` address; EOA or contract). It can do exactly one thing: `agentSpend(asset, to, amount)`.
  It can **not** change limits, recipients, guardians, timers or itself, and its spending is **never proof of life** (only owner actions are).
* **Limits the owner sets**: per asset (`address(0)` = ETH) a per-transaction cap and a per-period cap over a rolling window (1 h to 365 d),
  an allowlist of payees (≤32) and tokens (≤8). Anything outside → revert (`OverPerTxLimit`, `OverPeriodLimit`, `RecipientNotAllowed`, `AssetNotAllowed`).
  Window semantics: a window starts at the first spend after the previous one ended; a payer can therefore spend one full budget at the end of a window and another at the start of the next
  (≤2× the period budget within one period length, documented and tested).
* **Freeze, from three sources**: (1) *lapse*: automatic once `now > expiry + min(lateAllowance, grace)` (owner-chosen: freeze at the deadline, or let the agent work until the grace period ends) or while a release/handover challenge is running;
  (2) *guardian freeze*: any single guardian, only once the owner is late, cleared by any owner action; (3) *owner kill-switch*: freeze/unfreeze any time, persists across check-ins.
  An owner action (`checkIn`, config, …) bumps the epoch, which also voids votes and the challenge window, so **an owner who returns during the challenge window gets the agent back immediately**.
* **Two outcomes only**, both fixed by the owner in advance and chosen by the same N-of-M vote after `interval + grace`: **Handover** (`setSuccessor`): the vault's *ownership* passes to the successor (so funds *and* permissions move; funds stay in the vault, the agent is revoked and its limits cleared until the successor re-authorises one, and the timer restarts for the successor) or **Release / shutdown**: funds go to the beneficiary and the agent is stopped for good.
  Votes are counted per outcome per epoch; split votes can deadlock (the voter can `withdrawApproval`), and the guardian-less fallback still guarantees the beneficiary path.
* **Owner can revoke or replace the agent at any time** (`revokeAgent`, `setAgent`). A compromised agent key can lose at most one period budget, only to allowlisted payees.
* Same hardened release logic as the plain vault (reentrancy guard, gas-capped transfers, `sweep*`), no admin, no upgrade, no oracle, `block.timestamp` only.


```
check-in ─── interval ───┬─── grace ───┬─ guardians vote (N of M) ─┬─ challenge window ─┬─ execute
 (owner proof of life)   │ "overdue"   │ only after grace ends     │ owner can cancel   │ anyone calls
                         └ deadline    └ graceEnd                  └ threshold reached  └ funds → beneficiary
```

### Contract design (`contracts/src/Custos.sol`)
* **One vault per owner** via `CustosFactory.create(params)`; blast radius of a bug is one vault. No admin, no upgrade,
  no fees, no external dependencies (no OpenZeppelin), no oracle: time is `block.timestamp`, **never `block.number`** (on Robinhood Chain it is only an estimate of the *L1* block number).
* **Asset model: deposit.** Owner deposits ETH (plain transfer) and listed ERC-20s such as stablecoins (`depositToken`, which pulls with an
  allowance to *this vault only*) and can withdraw any time while alive. Chosen over the "approval/pull" model because
  approvals leave standing allowances on the owner's whole wallet and the heir may find an empty wallet at release time.
  Trade-off: funds sit in a contract (smart-contract risk) rather than in the owner's wallet.
* **Roles.** Owner: config, deposits/withdrawals, check-in, vacation mode, guardian replacement, close.
  Guardians (≤10): can *only* `approveRelease()`. Beneficiary: fixed by owner. Anyone: `executeRelease()`, `sweep*`.
* **Proof of life = any owner action.** `checkIn()`, config changes, deposits, withdrawals and pause all reset the timer, bump
  an `epoch` and void every vote/challenge (`ReleaseCancelled`).
* **Votes are epoch-scoped**: stale votes never carry over; double votes revert; replacing a guardian voids their vote.
* **Challenge window**: starts when approvals reach the threshold; owner activity cancels even *after* the window until
  `executeRelease()` actually runs.
* **Vacation mode**: `pause(≤90d)` pushes the deadline anchor out and self-expires: a dead owner can't lock funds by pausing.
* **Guardian-less fallback** (optional, ≥7d, `0` = off): if guardians lose keys/vanish, the beneficiary may claim
  `fallbackDelay` after grace ends. Owner can still cancel by checking in.
* **Release robustness**: state flips to `Released` *before* any transfer; `nonReentrant`; per-token transfers are
  gas-capped (300k), copy ≤32 bytes of return data, and never revert the batch; failures emit `TransferFailed` and are
  recoverable via `sweep()` / `sweepToken()`; a beneficiary that rejects ETH can `redirectPayout()` after release.
* **Events** for everything: `CheckedIn`, `GuardianApproved`, `ChallengeStarted`, `ReleaseCancelled`, `Released`, `Paused`,
  `GuardianReplaced`, `GuardiansUpdated`, `BeneficiaryChanged`, `TimingsUpdated`, `Forwarded`, `TransferFailed`, …
* Target EVM: `cancun` (to be confirmed by the testnet deploy; fall back to `shanghai` if needed). Contract sizes (~19.9 KB vault, ~22.8 KB factory; built with `via_ir`, both under Ethereum's 24 KB so the bytecode stays portable) are far below Robinhood's 96 KB limit and Ethereum's 24 KB. Bounds: interval 1d-5y, grace 1d-365d, challenge 1d-90d, ≤10 guardians, ≤32 tokens.

### Check-in assistant (`agent/`)
* `engine.decide()` is **pure and deterministic**: (profile, on-chain snapshot, now, already-sent keys) → exactly which
  messages are due (nudge → reminder → overdue ×4 → final warning; guardians: heads-up at half grace → vote open →
  challenge → executable; beneficiary only on release; all-clear if the owner returns). Idempotent keys; after downtime
  only the latest step per audience is sent (no spam); failed deliveries are retried next tick.
* **LLM = wording only.** `ClaudeWording` (only if `ANTHROPIC_API_KEY`) writes a 1-3 sentence *intro*. Code appends the
  plain-language "What happens next" block and links. Output is validated (length cap, no URLs, no numbers that aren't in the facts,
  no overpromises); any error/timeout/402-no-credit → `RulesWording`, with a circuit breaker (1h on 4xx, 1m on 5xx/network).
* **Watches the managed AI agent** through a `ManagedAgentAdapter` (`MockManagedAgent` simulates one on the `SimChain`; it is the only implementation: see gaps). `decideAgent()` is deterministic too:
  one notice per batch of payments (older ones are skipped, never spammed), *blocked attempt* (with the plain reason: per-payment limit, budget, payee not allowed, frozen), *nearing the budget* (≥80%, once per window),
  *frozen* (owner + guardians, per cause) and *unfrozen*, and after a handover a message to the old owner, the successor and the guardians. Payee/agent names come from an AI and are sanitised before display or before reaching Claude.
  Owner commands: `/freeze`, `/unfreeze` (simulated chains; on a real chain it links to the app, because the owner's wallet signs).
* **Adapters**: `MockChannel`, `ConsoleChannel`, `TelegramChannel` (Bot API via fetch + command polling).
  Commands: `/checkin`, `/status`, `/pause <days>`, `/help`. Unknown chats get nothing.
* **Check-in links** are HMAC-signed, **epoch-bound** (die after the owner checks in), and **GET never mutates** (a link
  preview/scanner can't check in for you; only a POST button does).
* **Chain**: `SimChain` (mock) or `ViemChainReader` (read-only RPC; verified against local anvil). On a real chain the
  agent *cannot* check in for the owner; it sends a link to the app where the owner's wallet signs.

### Web demo (`web/`)
* Dark/minimal, mobile-first (iPhone 13), one accent (`#f5b942`), four text sizes, 32px compact buttons.
* **Demo mode is a pure browser simulation** (labelled *SIMULATION* on every screen) that reuses the *same* state machine
  and message engine as the agent via `scripts/sync-model.sh`. Fast-forward runs the agent hour by hour so every reminder fires;
  try approving too early (the contract-rules revert is shown), approve as guardians, let the challenge run, return as the
  owner to cancel, or let it release.
* **AI-agent demo**: the wizard has a **Your AI agent** step (name, per-payment and per-day limits, allowed payees, when it freezes, successor). The dashboard shows an agent card (state, budget left, allowed payees, kill-switch, buttons that make the simulated AI pay or *try* something over the limit),
  the check-in assistant's messages as an activity feed, and a **FROZEN** state with the guardian actions: *Freeze*, *Hand over* (→ successor) and *Shut down* (→ beneficiary). **Fast-forward** drives both stories: owner silent → agent frozen → guardians vote → handover; or the owner returns and the agent is unfrozen.
* Optional **Real chain** panel (collapsed): viem + the browser's injected wallet only (no WalletConnect/Coinbase/Phantom),
  read-only lookup of a vault on **Robinhood Chain Testnet (default) or Mainnet** (viem chain definitions in `web/lib/robinhood.ts`, optional own https RPC URL) and owner `checkIn()`. The simulation stays the default. The panel never asks for keys and does not deploy anything.

## Security notes
* **Non-custodial; no key handling anywhere.** No code path reads, stores or requests a private key or seed phrase; the
  deploy script (`script/DeployRobinhood.s.sol`) takes its signer from the forge CLI (`--account`/`--ledger`), never from env or files; the wrapper `scripts/deploy-robinhood.sh` refuses `--private-key` and `PRIVATE_KEY`, is dry-run by default and needs a typed confirmation. The agent holds no
  keys and only sends messages.
* A compromised or prompt-injected agent can only do what the limits allow (see the threat model in [`PLAN.md`](PLAN.md#3-threat-model)); it cannot change config, keep itself alive, or move funds to anyone off the allowlist.
* Guardians can't redirect funds, can't act before `interval + grace`, and can't prevent an owner cancelling. Even total
  guardian collusion only *accelerates* release to the owner's chosen beneficiary by up to the grace period.
* **Owner key compromise** = attacker can withdraw and check in (same as any wallet). **Coercion**: no duress mode (roadmap).
* Reminder spoofing/phishing: the agent only links to its pinned `baseUrl`/`appUrl`; teach users to never enter keys.
* LLM prompt-injection is bounded: facts are structured, names are sanitised/capped, output is validated, and the model
  can't change which messages are sent, who receives them, or the "next steps" text.
* Full threat model: [`PLAN.md`](PLAN.md). Token ideas: [`docs/token-design.md`](docs/token-design.md) (design only, no token).

## Limitations / known gaps
* **Unaudited.** No formal verification; fuzz + mutation-checked unit tests only.
* **Not deployed anywhere**, including Robinhood testnet; only tested on local Foundry/anvil (chain 31337, and a local anvil posing as chain 46630). The web app has **no
  deploy-from-wizard flow**: the wizard configures the *simulation*. Real deployment is by `CustosFactory.create(...)` with
  the owner's own signer.
* Telegram adapter and Claude adapter are tested with mocked HTTP only; never run against the live APIs here. No email/SMS adapters yet.
* ERC-20 support assumes sane tokens; rebasing/fee-on-transfer tokens are handled on deposit only by balance delta; ERC-777/hook
  or blacklisting tokens may fail to forward (then `sweepToken`). NFTs (721/1155) are not supported.
* Owner deposit/withdraw/config count as "proof of life", by design (documented), which means a hostile actor with the owner key can keep the switch alive.
* Release gas worst-case is bounded (≤32 tokens × 300k), but Arbitrum-style gas accounting (L2 execution + L1 data fee) hasn't been measured on a live Robinhood network. Do that in the testnet soak.
* Robinhood Chain applies sequencer-level sanctions screening: a transaction from a sanctioned address is simply never included.
* Not legal advice and not a will; local inheritance/tax law still applies. Beneficiary can't be changed after release.
* The web demo's assistant messages use the rules wording (the LLM is server-side/optional in the real agent).
* **No real-chain agent-activity adapter.** The assistant reads the AI's activity from a mock adapter only; reading `AgentSpent` events needs log queries by block range, which the project avoids on Robinhood Chain (`block.number` is an L1 estimate). The real-chain reader mirrors agent state (frozen, successor, pending outcome) but not per-asset budgets (token decimals/symbols).
* The vault can't tell a *good* payment from a *bad* one to an allowlisted payee: limits bound the loss, they don't judge intent. A payee that is itself compromised stays a risk up to the budget.
* The period window is a simple rolling window with the 2× boundary effect above; a gradual (token-bucket) limit would be tighter but costs more gas.
* One agent key per vault, one asset budget per token; no per-recipient limits, no multi-agent hierarchy, no ERC-4337/session-key module integration yet.
* Handover moves the *vault*, not the agent: the successor has to authorise an agent again by choice. Funds held outside the vault (the agent's own wallet) are out of scope: that is why the agent spends *from the vault*.
* The product name is not final: see [`docs/BRAND.md`](docs/BRAND.md).

## Project layout
```
contracts/  src/{Custos,CustosFactory,Brand}.sol  src/interfaces/  test/  script/{Deploy,DeployRobinhood}.s.sol
agent/      src/{brand,chainModel,engine,explain,wording,managed,agent,channels,chain,store,server,cli}.ts  test/  examples/
web/        app/{page,setup,dashboard}  components/  lib/{brand,sim,robinhood}.ts  lib/agent/ (synced copy)  scripts/shots.mjs
scripts/    test-all.sh  anvil-e2e.sh  sync-model.sh  deploy-robinhood.sh  rename-product.sh
docs/       BRAND.md  DEPLOY-ROBINHOOD.md  token-design.md
```
