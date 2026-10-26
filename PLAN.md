# Heirloom — PLAN

> "Your crypto shouldn't die with you."

Working name: **Heirloom**. A non-custodial crypto dead-man's switch for Monad (EVM, mainnet chain id 143).
Everything here is local-only: no deploys, no repos pushed, no tokens launched, no keys held.

## 1. Components

| Dir | What | Stack |
|---|---|---|
| `contracts/` | `Heirloom` (per-owner switch vault) + `HeirloomFactory` + `IGuardianStaking` stub | Solidity 0.8.26, Foundry |
| `agent/` | Check-in agent: scheduler, escalation state machine, guardian alerts, adapters (mock / Telegram / console), LLM wording hook with rules fallback | Node 20, TypeScript, vitest |
| `web/` | Landing, setup wizard, dashboard, "Fast-forward time" simulation, optional wallet connect | Next.js (app router), wagmi + viem (injected only) |
| `docs/token-design.md` | Optional token-hook design (NOT deployed) | Markdown |

## 2. Contract architecture

**One contract per owner** (deployed through a factory). Blast radius of any bug is one owner's vault, not a shared pool.

### Asset model — deposit model (chosen)
The owner *deposits* native MON and whitelisted ERC-20s into the vault and may withdraw any time while it is alive.
Why not the approval ("pull") model?
* Approvals leave a standing allowance on the owner's wallet; a vault bug or a malicious token hook = drain risk against the *whole wallet*, and balances can move away so the heir finds an empty wallet.
* Approval pull needs the owner's wallet to still hold the tokens at release time and each token's `transferFrom` to behave; deposit gives a hard guarantee: what is in the vault at release goes to the heir.
* Cost of the deposit model: funds sit in a contract (smart-contract risk) and are not usable for staking/DeFi from the owner wallet. Documented trade-off. Per-owner vaults + small, auditable code keep this tolerable.

### Roles
* **Owner** – config, deposit/withdraw, check in, pause ("vacation mode"), replace guardians, close.
* **Guardians** (M, max 10) with threshold **N** – can only *approve a release to the pre-set beneficiary*. They can never choose the destination, withdraw, or change config.
* **Beneficiary** – fixed by owner. Receives funds on release. After release can only redirect payout address.
* **Anyone** – can execute a ripe release (keeper-friendly), can forward stray assets after release.

### Timeline (all deterministic, oracle-free — only `block.timestamp`)
```
checkIn ──── interval ────┬──── grace ────┬── guardians vote ──┬─ challenge window ─┬─ executable
 (anchor)                 │ owner "late"  │ approvals allowed  │ owner can cancel   │ anyone executes
                          └ expiry        └ graceEnd           └ threshold reached  └ challengeEnd
```
* `anchor = max(lastCheckIn, pausedUntil)`; `expiry = anchor + interval`; `graceEnd = expiry + grace`.
* Guardians can `approveRelease()` only when `now > graceEnd` and not paused. Votes are keyed by an **epoch** that increments on every owner check-in/config change, so stale votes are void.
* When approvals reach the threshold the **challenge window** starts. Any owner activity (check-in, config change, withdraw, pause) cancels it: epoch++, votes cleared, `ReleaseCancelled` event.
* After `challengeEnd`, anyone calls `executeRelease()`: state flips to `Released` first (checks-effects-interactions + reentrancy guard), then native MON and every listed token is forwarded.
* **Guardian-less fallback** (optional, `fallbackDelay` ≥ 7d or 0=off): if guardians vanish (lost keys, unresponsive), the beneficiary can claim after `graceEnd + fallbackDelay`. Owner can still cancel by checking in until claimed. Solves guardian liveness-failure.
* **Pause / vacation mode**: `pause(duration ≤ 90d)` pushes the anchor to `now+duration`. It self-expires — a dead owner cannot lock funds forever by pausing.

### Safety properties (tested)
1. No release before `graceEnd` regardless of how many guardians collude.
2. Guardians cannot redirect funds; only the beneficiary set by the owner can ever receive.
3. Each guardian counts once per epoch; replaced guardians' votes are removed.
4. Owner check-in at any time before execution (including during challenge) fully cancels.
5. Reentrancy via beneficiary receive hook / malicious token cannot double-pay or block release.
6. A reverting / gas-bombing token cannot block releasing everything else (per-token gas cap, try-style calls; leftovers recoverable with `sweepToken`).
7. After release the contract is terminal: no config changes, no owner withdrawals.

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
| **Contract bug** | Small surface, no upgradability, no admin, no external deps, extensive tests + fuzz. | **Unaudited.** Do not use with real funds before an audit. |
| **Agent compromise** | Agent holds no keys; it can only send messages. It reads chain state; owner check-in is a user-signed tx. | Phishing via spoofed reminders: link domains must be pinned (README). |
| **LLM misuse** | LLM only writes wording; all state/time decisions in deterministic code; output sanitized & length-capped; rules fallback. | Prompt injection limited to wording because inputs are structured facts only. |

## 4. Check-in agent design
* `Store` (JSON file / memory) holds per-switch state: `lastCheckIn`, interval, grace, challenge, contacts.
* `decide(now, state) → Plan` — **pure deterministic**: stage (`ok | nudge | reminder | urgent | overdue | guardian_alert | challenge | released`), which recipients, whether to send.
* `Wording` — interface `compose(facts) → text`. `ClaudeWording` (ANTHROPIC_API_KEY, 8s timeout, validated) → falls back to `RulesWording` on any error/no key.
* `Channel` adapters: `MockChannel` (in-memory transcript, simulated owner replies), `ConsoleChannel`, `TelegramChannel` (Bot API via fetch; token via env, never required).
* A tick loop (`runTick`) is idempotent: dedupes by `(switchId, stage, epoch)`.

## 5. Web demo
Next.js app, dark minimal, one accent (amber `#f5b942`), mobile-first (iPhone 13: 390×844). Pages: `/` story, `/setup` wizard, `/dashboard` countdown + simulation controls. Demo mode runs a deterministic in-browser simulation of the same state machine (ported from the contract/agent), labelled **SIMULATION** everywhere. Wallet connect is optional (wagmi injected connector only), reading chain 143 config; disabled unless configured.

## 6. Testing
* Foundry: unit, scenario (time travel), fuzz, reentrancy attackers, hostile tokens.
* Agent: vitest for decide(), fallback wording, mock channel flow.
* Web: `next build`, Playwright screenshots (390×844 + desktop).

## 7. Out of scope (MVP)
Deploy, audit, token launch, real Telegram/Claude calls, duress mode, multi-asset NFTs, upgradeability.
