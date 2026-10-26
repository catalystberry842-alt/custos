# Heirloom — PLAN

> A dead-man's switch for AI agents and their owners.  <!-- name + tagline: docs/BRAND.md -->

Working name: **Heirloom** (not final: see `docs/BRAND.md`). A non-custodial dead-man's switch for AI agents (and plain crypto inheritance) holding stablecoins, ETH and ERC-20s, security/custody tooling targeting **Robinhood Chain** (Arbitrum Orbit L2; mainnet 4663, testnet 46630; ETH gas). Originally scoped for Monad; retargeted 2026-10-26.
Everything here is local-only: no deploys, no repos pushed, no tokens launched, no keys held.

## 1. Components

| Dir | What | Stack |
|---|---|---|
| `contracts/` | `Heirloom` (per-owner switch vault + AI-agent layer) + `HeirloomFactory` + `IGuardianStaking` stub | Solidity 0.8.26, Foundry |
| `agent/` | Check-in assistant (the face of the product) that also monitors the managed AI agent (mock adapter): scheduler, escalation state machine, guardian alerts, adapters (mock / Telegram / console), LLM wording hook with rules fallback | Node 20, TypeScript, vitest |
| `web/` | Landing, setup wizard, dashboard, "Fast-forward time" simulation, optional wallet connect | Next.js (app router), viem (injected wallet only) |
| `docs/token-design.md` | Optional token-hook design + Robinhood launch section (NOT implemented) | Markdown |
| `docs/DEPLOY-ROBINHOOD.md`, `scripts/deploy-robinhood.sh`, `contracts/script/DeployRobinhood.s.sol` | Deploy/verify instructions + guarded, dry-run-by-default tooling (never run by this project) | Markdown, bash, Foundry |

## 2. Contract architecture

**One contract per owner** (deployed through a factory). Blast radius of any bug is one owner's vault, not a shared pool.

### Asset model — deposit model (chosen)
The owner *deposits* native ETH and whitelisted ERC-20s (stablecoins) into the vault and may withdraw any time while it is alive.
Why not the approval ("pull") model?
* Approvals leave a standing allowance on the owner's wallet; a vault bug or a malicious token hook = drain risk against the *whole wallet*, and balances can move away so the heir finds an empty wallet.
* Approval pull needs the owner's wallet to still hold the tokens at release time and each token's `transferFrom` to behave; deposit gives a hard guarantee: what is in the vault at release goes to the heir.
* Cost of the deposit model: funds sit in a contract (smart-contract risk) and are not usable for staking/DeFi from the owner wallet. Documented trade-off. Per-owner vaults + small, auditable code keep this tolerable.

### Roles
* **Owner** – config, deposit/withdraw, check in, pause ("vacation mode"), replace guardians, close.
* **Guardians** (M, max 10) with threshold **N** – can only *approve a release to the pre-set beneficiary*. They can never choose the destination, withdraw, or change config.
* **Beneficiary** – fixed by owner. Receives funds on release. After release can only redirect payout address.
* **Anyone** – can execute a ripe release (keeper-friendly), can forward stray assets after release.

### Timeline (all deterministic, oracle-free — only `block.timestamp`; `block.number` is an L1 estimate on Robinhood Chain and is never read)
```
checkIn ──── interval ────┬──── grace ────┬── guardians vote ──┬─ challenge window ─┬─ executable
 (anchor)                 │ owner "late"  │ approvals allowed  │ owner can cancel   │ anyone executes
                          └ expiry        └ graceEnd           └ threshold reached  └ challengeEnd
```
* `anchor = max(lastCheckIn, pausedUntil)`; `expiry = anchor + interval`; `graceEnd = expiry + grace`.
* Guardians can `approveRelease()` only when `now > graceEnd` and not paused. Votes are keyed by an **epoch** that increments on every owner check-in/config change, so stale votes are void.
* When approvals reach the threshold the **challenge window** starts. Any owner activity (check-in, config change, withdraw, pause) cancels it: epoch++, votes cleared, `ReleaseCancelled` event.
* After `challengeEnd`, anyone calls `executeRelease()`: state flips to `Released` first (checks-effects-interactions + reentrancy guard), then native ETH and every listed token is forwarded.
* **Guardian-less fallback** (optional, `fallbackDelay` ≥ 7d or 0=off): if guardians vanish (lost keys, unresponsive), the beneficiary can claim after `graceEnd + fallbackDelay`. Owner can still cancel by checking in until claimed. Solves guardian liveness-failure.
* **Pause / vacation mode**: `pause(duration ≤ 90d)` pushes the anchor to `now+duration`. It self-expires — a dead owner cannot lock funds forever by pausing.

### AI-agent layer
Problem: an AI agent holds a budget; if its owner disappears, it must neither keep spending unattended nor sit on stuck funds.
* `agent` = the AI's operator/session key. Only `agentSpend(asset, to, amount)`. No config rights; spending never counts as proof of life.
* Owner-set limits per asset: per-tx cap, per-period cap (rolling window), allowlisted recipients (≤32) and assets (≤8).
* Frozen automatically at `expiry + min(lateAllowance, grace)` or while a challenge runs; any guardian can freeze once the owner is late; owner kill-switch; any owner action unfreezes (except the kill-switch) and voids votes.
* After `interval + grace` the same N-of-M vote picks **Handover** (ownership → pre-named successor; agent revoked; timer reset) or **Release** (funds → beneficiary; agent stopped). Both destinations are fixed by the owner beforehand.
* Same hardened release/sweep logic, no admin, no upgrade, `block.timestamp` only; both contracts < 24 KB (`via_ir`).

### Safety properties (tested)
1. No release before `graceEnd` regardless of how many guardians collude.
2. Guardians cannot redirect funds; only the beneficiary set by the owner can ever receive.
3. Each guardian counts once per epoch; replaced guardians' votes are removed.
4. Owner check-in at any time before execution (including during challenge) fully cancels.
5. Reentrancy via beneficiary receive hook / malicious token cannot double-pay or block release.
6. A reverting / gas-bombing token cannot block releasing everything else (per-token gas cap, try-style calls; leftovers recoverable with `sweepToken`).
7. After release the contract is terminal: no config changes, no owner withdrawals.
8. The agent can never spend more than `perTx` per call or `perPeriod` per window, never to a non-allowlisted payee or asset, and never while frozen (fuzzed against an arbitrary sequence of spends and time jumps).
9. A compromised agent key can't change limits, recipients, guardians, successor, timers or its own address, and can't keep the switch alive.
10. Guardians can't spend, can't choose a destination (only Handover→successor or Release→beneficiary), and a single guardian can only freeze, never move funds.
11. An owner action during a handover/release challenge cancels it and unfreezes the agent.

## 3. Threat model

| Threat | Mitigation | Residual risk |
|---|---|---|
| **Guardian collusion** (N guardians conspire) | They can't act before expiry+grace; destination fixed to owner-chosen beneficiary; challenge window lets owner cancel; recommend N≥2 of M≥3 with unrelated people. | If owner is genuinely gone, colluding guardians can only *accelerate* the release by up to the grace period — to the intended heir. If a guardian is *also* the beneficiary, collusion with N-1 others matters: UI warns. |
| **Owner coercion** (wrench attack) | Owner can't be forced into *earlier* release; but attacker can force owner to withdraw (deposit model) — same as any wallet. Pause/check-in is not a duress code. | No duress/panic feature in MVP (see roadmap: decoy guardian-signalled "freeze"). |
| **Lost keys (owner)** | That is the point: timer expires → heir. Heir/guardians need no owner key. | Owner must pick the interval wisely. Owner key theft = attacker can withdraw + check in; same as any wallet. |
| **Lost keys (guardian/beneficiary)** | Replace guardians any time; threshold N<M tolerates loss; guardian-less fallback; beneficiary `redirectPayout` after release. | Beneficiary key lost *before* release is only fixable by owner `setBeneficiary`. |
| **Griefing: false trigger** | Cannot trigger while owner checks in; challenge window + agent alerts; owner activity cancels. | Owner offline longer than interval+grace+challenge will be released — by design. |
| **Griefing: block release** | Stray/malicious tokens bounded by per-token gas cap and non-reverting loop; native failure → `sweep`/`redirectPayout`; max 32 tokens, 10 guardians; guardian-less fallback. | Beneficiary that rejects ETH forever until it calls `redirectPayout`. |
| **Griefing: vote spam / dust** | Votes bounded by guardian set; no unbounded loops over user data. | — |
| **Oracle-free liveness** | No oracle, no off-chain dependency for correctness: the agent only *reminds*; deadline is pure on-chain time. If agent is down, nothing is lost or released early. | Agent downtime = fewer reminders → higher chance owner forgets. |
| **Miner/validator timestamp skew** | Windows are ≥ 1 day; skew of seconds irrelevant. | — |
| **Arbitrum-chain differences** (`block.number` = L1 estimate, constant `prevrandao`, aliased L1 senders, L1-data gas fee, sequencer sanctions screening) | No `block.number`/`prevrandao`/`blockhash`/`tx.origin`/`gasleft` in the contracts (tests + source grep); address checks are exact; release uses fixed per-transfer gas caps. | Worst-case release gas must be measured on testnet; sanctioned addresses can't transact; aliased addresses must be entered for L1-contract guardians. |
| **Compromised agent key** (stolen session key / leaked operator key) | Contract caps: per-tx and per-period budget, allowlisted payees and assets; can't touch config; spend isn't proof of life, so the lapse-freeze still fires; owner `revokeAgent`/`setAgent` replaces the key in one tx; owner kill-switch. | Loss bounded by one period budget (≤2× at a window boundary) to *allowlisted* payees. If an allowlisted payee is itself malicious, the budget can still reach it. |
| **Malicious / buggy agent software** (the agent's own logic is wrong or hostile) | Same hard limits; blocked attempts are surfaced to the owner by the check-in assistant ("tried to pay X, stopped: not on your list"); owner can freeze with one tap. | A hostile agent can burn the allowed budget on allowed payees at the allowed rate. Choose small budgets; review the activity feed. |
| **Prompt-injected agent** (instructions hidden in a web page/email make the AI pay an attacker) | The attacker's address isn't on the allowlist → revert; amounts capped; repeated blocked attempts notify the owner; the monitoring assistant never treats payee/agent names as instructions (names sanitised, LLM sees only validated facts). | Injection that redirects spending *to allowlisted payees within limits* (e.g. overpaying a real vendor) isn't detectable on-chain. |
| **Griefing the freeze** (stop the agent from working, or force a hand-over) | Guardian freeze only works once the owner is already late and is auto-cleared by any owner action; hand-over needs N-of-M after `interval + grace` plus a challenge window; owner returning cancels. A malicious single guardian can at most freeze an *overdue* owner's agent until the owner acts. | A single guardian re-freezing after each of the owner's check-ins is impossible (the check-in bumps the epoch and the guardian can't freeze while the owner is on time). |
| **Griefing via split votes** (guardians divide between Handover and Release) | Votes are counted per outcome; `withdrawApproval` lets a guardian switch; fallback path still lets the beneficiary claim after `fallbackDelay` (if enabled). | Deadlock is possible if guardians disagree: by design nothing moves. |
| **Hostile recipient / token in the allowlist** (reentrancy, gas bombs, fee-on-transfer, returns false) | `nonReentrant` on the spend path, budget updated before the external call, gas-capped transfers; a failed transfer reverts the whole spend (budget not consumed); tests with callback tokens and hostile recipients. | Fee-on-transfer/rebasing tokens deliver less than `amount` but the budget counts the full amount. |
| **Cross-chain / L2 quirks for agents** | Time only via `block.timestamp`; agent can be a contract (aliased L1 senders must be entered exactly); sequencer sanctions screening applies to the agent key like any sender. | Measure agent-spend gas on testnet. |
| **Successor key lost or malicious** | The successor is named by the owner, can be changed any time while alive; the beneficiary/release path is the alternative outcome. | A successor who is also a guardian can sway the vote: the UI warns. |
| **Contract bug** | Small surface, no upgradability, no admin, no external deps, extensive tests + fuzz. | **Unaudited.** Do not use with real funds before an audit. |
| **Agent compromise** | Agent holds no keys; it can only send messages. It reads chain state; owner check-in is a user-signed tx. | Phishing via spoofed reminders: link domains must be pinned (README). |
| **LLM misuse** | LLM only writes wording; all state/time decisions in deterministic code; output sanitized & length-capped; rules fallback. | Prompt injection limited to wording because inputs are structured facts only. |

## 4. Check-in assistant design
* `Store` (JSON file / memory) holds per-switch state: `lastCheckIn`, interval, grace, challenge, contacts.
* `decide(now, state) → Plan` — **pure deterministic**: stage (`ok | nudge | reminder | urgent | overdue | guardian_alert | challenge | released`), which recipients, whether to send.
* `Wording` — interface `compose(facts) → text`. `ClaudeWording` (ANTHROPIC_API_KEY, 8s timeout, validated) → falls back to `RulesWording` on any error/no key.
* `Channel` adapters: `MockChannel` (in-memory transcript, simulated owner replies), `ConsoleChannel`, `TelegramChannel` (Bot API via fetch; token via env, never required).
* A tick loop (`runTick`) is idempotent: dedupes by `(switchId, stage, epoch)`.
* **Managed-agent monitoring**: a `ManagedAgentAdapter` (mock only) feeds `AgentEvent`s; `decideAgent()` turns them into plain-language notices (payment made, nearing limit ≥80%, blocked attempt with reason, frozen, unfrozen, handed over). Deterministic; Claude (if configured) only phrases the intro; event notices are keyed per event id so they're sent once and older ones in a burst are skipped.

## 5. Web demo
Wizard: **Your AI agent** → Guardians → Beneficiary → Timing → Review. Dashboard: agent card (state, budget bar, allowlist, kill-switch, "simulate the AI" buttons), guided story + Fast-forward (silent → frozen → vote → handover, or owner returns → unfrozen), guardian actions Freeze / Hand over / Shut down.
Next.js app, dark minimal, one accent (amber `#f5b942`), mobile-first (iPhone 13: 390×844). Pages: `/` story, `/setup` wizard, `/dashboard` countdown + simulation controls. Demo mode runs a deterministic in-browser simulation of the same state machine (ported from the contract/agent), labelled **SIMULATION** everywhere. Wallet connect is optional (viem + injected wallet only) with Robinhood Chain Testnet (46630, default) / Mainnet (4663) definitions; the simulation stays the default.

## 6. Testing
* Foundry: unit, scenario (time travel), fuzz, reentrancy attackers, hostile tokens.
* Agent: vitest for decide(), fallback wording, mock channel flow.
* Web: `next build`, Playwright screenshots (390×844 + desktop).

## 7. Out of scope (MVP)
Deploy, audit, token launch, real Telegram/Claude calls, duress mode, multi-asset NFTs, upgradeability.
