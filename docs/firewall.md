# Custos Agent Firewall

> **The rules are enforced outside the AI model.** A prompt that says "don't spend over $20" is a request to the model, not a security
> boundary: the model can be jailbroken, prompt-injected or simply buggy. The firewall checks every transaction an agent proposes,
> in plain deterministic code, **before it can reach the signer**. Unauthorized actions fail even if the agent misbehaves.

Status: **simulation + tested library.** Unaudited. No chain deployment, no token, no keys anywhere. The web demo (`/firewall`) runs the
real engine in the browser against a deterministic mock simulator with fake addresses, balances and time.

```
 AI agent ──proposes──▶  FIREWALL (firewall/, off-chain, outside the model)  ──approved only──▶  signer ──▶ Custos vault (on-chain hard caps)
 (can say anything)       decode calldata → 15 rules → approve | block | pending human            (the backstop if the firewall is bypassed)
                                           │
                                           └─ every decision → hash-chained audit trail ("Proof of Agent")
```

## What it checks (`firewall/src/policy.ts`)

The engine **decodes the raw transaction itself** (`calldata.ts`). The agent's stated intent is stored in the log but never trusted.
All 15 rules are evaluated on every action (no early exit), so the audit trail shows exactly which passed and which failed.

| # | Rule | Fails when | Result |
|---|---|---|---|
| 1 | Kill switch | global kill switch on, or this agent frozen (manually or by the circuit breaker) | block |
| 2 | Right network | `chainId` differs from the policy's chain (cross-chain replay) | block |
| 3 | Replay and nonce | nonce not strictly greater than the last accepted, or identical action seen before | block |
| 4 | Threat check | recipient/spender/target on the known-bad list, or an address-poisoning lookalike of an allowlisted payee | block |
| 5 | Token approvals | unlimited `approve`/`increaseAllowance` (≥ 2^128), any `permit`, `setApprovalForAll(true)`; approval to an unlisted spender goes to a human | block / pending |
| 6 | Asset allowlist | token not allowlisted for this agent (also checked against assets the simulation says would leave) | block |
| 7 | Contract allowlist | target not allowlisted | pending (or block, per policy) |
| 8 | Function allowlist | function name not allowed (unknown selectors are `unknown(0x…)`, malformed calldata is `malformed(0x…)`) | block / pending |
| 9 | Destination | transfer recipient not on the recipient allowlist | block |
| 10 | Per-transaction limit | USD value (the larger of declared and simulated) above the limit; an approval counts as exposure | block |
| 11 | Daily limit | rolling 24 h spend would exceed it | block |
| 12 | Lifetime cap | cumulative spend would exceed it | block |
| 13 | Transaction quota | more than N approved transactions in the window (runaway-loop guard) | block |
| 14 | Human approval threshold | amount above the owner's "ask me above" amount | pending |
| 15 | Simulation | the call would revert, or moves more value than the action declares (e.g. a `claim()` that sweeps the wallet) | block |

* **pending** means a human decides (approve/deny in the queue). Approving re-checks every *hard* rule at that moment, so a human click
  cannot override a kill switch, a replay or a simulation failure.
* **Circuit breaker:** N blocked actions inside a window freeze the agent until a human resets it (a block caused by an already-active kill
  switch does not feed the breaker).
* **Per-agent policies.** Each registered agent has its own policy (assets, contracts, functions, recipients, spenders, limits, quota).
  Changing a policy is itself an audited event and records the policy hash.

## Simulation and threat checks (pluggable)

* `Simulator` interface (`simulate.ts`): `simulate({action, decoded}) → {ok, revertReason, balanceChanges, approvalsGranted}`.
  * `MockSimulator`: deterministic; models insufficient balance, reverting contracts and "drain" contracts. Used by the demo and tests.
  * `EthCallSimulator`: ready to wire to a real RPC (`eth_call` + `eth_estimateGas`) through an injected `rpc` function; tested with a fake RPC
    only. It detects reverts but **cannot compute balance changes**: for that, implement `Simulator` with a tracing provider (Tenderly,
    `debug_traceCall`, an Anvil fork).
* `ThreatChecker` (`threat.ts`): known-bad addresses, address-poisoning lookalikes (same first/last characters as an allowlisted payee),
  unlimited-approval detection, unverified-contract flag. Data is injected (`ThreatIntel`); the demo list is fake.

## Proof of Agent: the audit trail (`firewall/src/audit.ts`)

Append-only, hash-chained log: each entry stores `prevHash` and `hash = SHA-256(canonical JSON of the entry)`; genesis is 64 zeros. Entries
record which registered agent requested what, every rule's pass/fail, the decision, the policy hash in force, human resolutions, kill-switch
and breaker events, and execution results. `verifyChain()` detects any edited, deleted or reordered entry and says where it broke.
The web demo has a "Try tampering" button that shows exactly that.

**What it proves, and what it doesn't.** It proves *what the firewall decided* and that the record was not rewritten afterwards. It does **not**
prove the agent is honest, that its intent was benign, or that the decision was the *right* one. A log whose latest head hash is not anchored
somewhere you trust (another system, or on-chain) can be replaced wholesale by whoever controls the storage. Anchoring is not built.

## Hard layer on-chain, and the split

The off-chain firewall is only as strong as the process running it. The contract is the backstop: **`Custos.agentSpend` keeps enforcing its own
caps even if the firewall is bypassed or the agent's key leaks.**

| Layer | Where | Enforces |
|---|---|---|
| Hard | `contracts/src/Custos.sol` | per-payment cap, per-period cap per asset, recipient allowlist, freeze (owner/guardian/lapse), **new: call quota** (`setAgentCallQuota(maxCalls)`: at most N `agentSpend` calls per period, runaway guard; reverts `OverCallQuota`; reset by agent re-config/revoke). The vault has no `approve` or arbitrary-call path, so the agent cannot create token approvals through it at all. |
| Rich | `firewall/` (off-chain) | function/contract/asset allowlists, approval blocking, simulation, threat intel, replay protection, human approval, per-agent policies, audit |

The factory is at about 23.5 KB of the 24,576-byte limit (≈1 KB margin), so only the small call-quota addition went on-chain; everything
richer lives off-chain on purpose. Nothing on-chain was weakened (forge: 167 tests incl. 9 new for the quota, plus a fuzz test).

## Honest limits

* **A daily spend limit is not a loss limit.** A compromised agent can still spend up to the limit, every day, to allowed payees.
  Pick small budgets and use the lifetime cap and the circuit breaker.
* **A compromised allowlisted payee is undetectable.** If Acme's address is hijacked and it is on your list, a legitimate-looking payment passes.
  The lookalike check only catches *imitations*, not the real address turning bad.
* **Simulation is not a real chain.** The demo simulator is a mock. `EthCallSimulator` is untested against a live node and cannot see balance
  changes. A real attacker contract can behave differently in simulation than on-chain (time/state/oracle-dependent logic).
* **Prices are static** in the policy (`usd` per asset). Real USD limits need a price oracle and a story for stale or manipulated prices.
* **Off-chain enforcement requires the signer to sit behind the firewall.** If the agent holds its own key, nothing here stops it signing directly.
  The firewall is a gatekeeper in front of a signer the agent cannot reach; the vault's agent path is the on-chain version of that.
* **Human approval is only as good as the human.** Approval fatigue is real; the queue shows the reasons, but a rubber-stamping owner defeats it.
* **No intent analysis.** There is no LLM judge by design (it would be another model to fool). Everything is deterministic rules.
* **Single-process state.** Nonces, spends and the log live in memory (the demo persists to `localStorage`). No distributed or durable store.
* Unaudited; no formal verification.

## How it compares

Written from the projects' public docs; check them for current details.

| | Where rules run | Policy | Simulation / threats | Audit | Notes |
|---|---|---|---|---|---|
| **Custos Firewall** | Off-chain, in front of any signer, **plus on-chain vault caps as a hard backstop** | Per-agent allowlists, spend limits, quota, approvals, human queue, kill switch/breaker; portable across agents and wallets | Pluggable simulator + simple threat checks | Hash-chained, verifiable in a browser | Simulation/library stage, unaudited, no live network |
| [AgentARC](https://github.com/galaar-org/AgentARC) | Off-chain pipeline between the agent and the wallet (EOA, 4337, Safe, CDP) | YAML policies: ETH/token limits, address and function allow/deny lists, gas limit | Tenderly simulation, honeypot (buy-then-sell) test, optional LLM risk analysis | Logging | Broader simulation and token-trap detection than Custos today; its LLM stage is a model-based check, not a hard boundary; no on-chain backstop |
| [MetaMask Agent Wallet](https://metamask.io/agent-wallet) | A MetaMask-operated wallet/server pipeline with 2FA approvals (Guard / Beast modes) | Rolling 24 h outflow limit, network/address/token allowlists, risk profile | Simulation, Blockaid-powered threat scanning, MEV protection | Flagged and completed actions logged | A product for its own wallet, with real scanning; Custos is a policy layer you can put in front of other wallets/agents |
| [ERC-8196](https://eips.ethereum.org/EIPS/eip-8196) (AI Agent Authenticated Wallet) | **On-chain** wallet interface: executes only with proof of compliance with an owner policy (EIP-712, nonces, entropy commitments) | Policy hash with allowed actions/contracts, limits, validity windows, minimum ERC-8126 verification score | ERC-8126 risk scoring | Immutable on-chain hash-chained audit entries | A standard, not a product; fully on-chain enforcement costs gas and code size. Custos' on-chain part is far smaller |

**Where Custos is different:** one *portable* policy layer that sits in front of any agent or wallet, **verifiable decisions** (a hash-chained
trail anyone can re-check) and an **on-chain hard backstop** that still holds if the off-chain layer fails, tied to a dead-man's switch that freezes
the agent when its owner goes silent. Where it is weaker today: the simulation and threat intelligence are far thinner than AgentARC's or
MetaMask's, and nothing is audited or deployed.

## Using the library

```ts
import { Firewall, MockSimulator, ThreatChecker, demoPolicy, demoWorld, demoIntel, encodeTransfer } from "custos-firewall";

const fw = new Firewall({ simulator: new MockSimulator(demoWorld()), threat: new ThreatChecker(demoIntel()) });
fw.registerAgent("atlas", "Atlas", demoPolicy(), Date.now());
const d = await fw.submit({ agentId: "atlas", nonce: 1, ts: Date.now(), chainId: 46630, to: USDC, data: encodeTransfer(payee, 20_000000n) });
if (d.verdict === "approve") { /* hand to the signer */ fw.reportResult(d.auditIndex, { ok: true, detail: "sent" }, Date.now()); }
// d.verdict === "pending": show it to a human, then fw.resolvePending(d.pendingId, "approve" | "deny", "owner", Date.now())
```

Tests: `cd firewall && npm test` (58 tests: decoding, every rule, the six attack scenarios, replay, kill switch/breaker, pending approvals,
simulators, threat checks, audit tamper detection, persistence). The web copy is generated by `scripts/sync-firewall.sh` and covered by
`web/test/fwdemo.test.ts`.
