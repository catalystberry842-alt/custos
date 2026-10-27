import { lc } from "./calldata.js";
import type { SimulationResult } from "./simulate.js";
import type { ThreatFinding } from "./threat.js";
import type { AgentPolicy, Decoded, RawAction, RuleResult, Verdict } from "./types.js";

export interface AgentRuntime {
  lastNonce: number;
  seen: string[];
  frozen: boolean;
  frozenReason?: string;
  /** approved spends, for the rolling daily limit and the cumulative cap */
  spends: { ts: number; usd: number }[];
  cumulativeUsd: number;
  approvedTs: number[];
  blockedTs: number[];
}
export const newRuntime = (): AgentRuntime => ({ lastNonce: -1, seen: [], frozen: false, spends: [], cumulativeUsd: 0, approvedTs: [], blockedTs: [] });

export const DAY_MS = 86_400_000;
export const fmtUsd = (n: number, unit?: string) => {
  if (!Number.isFinite(n)) return "unlimited";
  if (unit && unit !== "$") return `${Number(n.toPrecision(3)).toString()} ${unit}`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
};
const short = (a?: string) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "?");

export function valueUsd(policy: AgentPolicy, asset: string | undefined, raw: bigint | undefined): number | undefined {
  if (asset === undefined || raw === undefined) return 0;
  const info = policy.assets[asset];
  if (!info) return undefined;
  return (Number(raw) / 10 ** info.decimals) * info.usd;
}

export interface EvalInput {
  policy: AgentPolicy;
  rt: AgentRuntime;
  action: RawAction;
  decoded: Decoded;
  findings: ThreatFinding[];
  sim: SimulationResult;
  killAll: boolean;
  replay: { nonceOk: boolean; digestSeen: boolean };
  /** a human has approved this exact action: soft ("pending") failures pass, hard blocks still block */
  humanApprovedBy?: string;
}
export interface Evaluation { verdict: Verdict; rules: RuleResult[]; reasons: string[]; usd: number }

const SPENDING = new Set(["native_transfer", "erc20_transfer", "erc20_transferFrom"]);

/** Pure: every rule is evaluated (no early exit) so the audit trail shows exactly which rules passed and which failed. */
export function evaluatePolicy(i: EvalInput): Evaluation {
  const { policy: p, rt, action, decoded: d, sim } = i;
  const f = (n: number) => fmtUsd(n, p.unit);
  const rules: RuleResult[] = [];
  const add = (rule: string, label: string, ok: boolean, severity: RuleResult["severity"], pass: string, fail: string) =>
    rules.push({ rule, label, ok, severity: ok ? "info" : severity, detail: ok ? pass : fail });

  const contracts = new Set([...p.contracts.map(lc), ...Object.keys(p.assets).filter((a) => a !== "native")]);
  const allowFns = new Set(p.functions);
  const contractKnown = d.kind === "native_transfer" || contracts.has(d.target);
  const unknownSev: "block" | "pending" = p.unknownContract === "pending" ? "pending" : "block";

  // amounts: what the action says, and what the simulation says it really moves
  const declared = SPENDING.has(d.kind) ? valueUsd(p, d.asset, d.amountRaw) : d.kind === "contract_call" ? (d.amountRaw ? valueUsd(p, "native", d.amountRaw) : 0) : 0;
  const exposure = d.unlimited ? Infinity : d.kind === "approve" || d.kind === "permit" ? valueUsd(p, d.asset, d.amountRaw) : undefined;
  let simOut = 0;
  const strangeAssets: string[] = [];
  for (const c of sim.balanceChanges) {
    if (c.delta >= 0n) continue;
    const v = valueUsd(p, c.asset, -c.delta);
    if (v === undefined) strangeAssets.push(c.asset); else simOut += v;
  }
  const declaredUsd = declared ?? 0;
  const effective = Math.max(declaredUsd, simOut, exposure ?? 0);

  // 1 kill switch
  add("kill_switch", "Kill switch", !(i.killAll || rt.frozen), "block", "Kill switch is off",
    i.killAll ? "Emergency kill switch is ON for all agents" : `Agent is frozen: ${rt.frozenReason ?? "kill switch"}`);
  // 2 chain + replay
  add("chain", "Right network", action.chainId === p.chainId, "block", `Chain ${action.chainId} matches the policy`, `Action is for chain ${action.chainId} but the policy is for chain ${p.chainId} (cross-chain replay guard)`);
  add("replay", "Replay and nonce", i.replay.nonceOk && !i.replay.digestSeen, "block", `Nonce ${action.nonce} is new`,
    i.replay.digestSeen ? "This exact action was already submitted (replay)" : `Nonce ${action.nonce} was already used (last accepted ${rt.lastNonce}): replay blocked`);
  // 3 threat intel
  const crit = i.findings.filter((f) => f.level === "critical" && f.code !== "unlimited_approval");
  add("threat", "Threat check", crit.length === 0, "block", "No known-bad or lookalike address", crit.map((f) => f.detail).join("; "));
  // 4 approvals
  if (d.kind === "approve" || d.kind === "permit" || d.kind === "setApprovalForAll") {
    if (d.unlimited) add("approvals", "Token approvals", false, "block", "", `Unlimited ${d.fn} blocked: it would let ${short(d.spender)} take every ${p.assets[d.asset ?? ""]?.symbol ?? "token"} the wallet ever holds`);
    else if (d.fn === "permit" || d.fn === "setApprovalForAll") add("approvals", "Token approvals", false, "block", "", `${d.fn} is always blocked: it grants access without a normal on-chain approval`);
    else if (!p.spenders.map(lc).includes(d.spender ?? "")) add("approvals", "Token approvals", false, "pending", "", `Approval to ${short(d.spender)}, who is not an allowed spender: a human decides`);
    else add("approvals", "Token approvals", true, "block", `Bounded approval to allowed spender ${short(d.spender)}`, "");
  } else add("approvals", "Token approvals", true, "block", "No approval in this action", "");
  // 5 asset
  const assetOk = d.kind === "contract_call" ? true : !!p.assets[d.asset ?? ""];
  add("asset", "Asset allowlist", assetOk && strangeAssets.length === 0, "block", d.kind === "contract_call" ? "Not a direct token movement" : `${p.assets[d.asset ?? ""]?.symbol ?? "asset"} is allowed`,
    strangeAssets.length ? `Simulation shows an asset outflow that is not allowed (${strangeAssets.map(short).join(", ")})` : `Asset ${short(d.asset)} is not on this agent's allowlist`);
  // 6 contract
  const verifiedWarn = i.findings.find((f) => f.code === "unverified_contract");
  add("contract", "Contract allowlist", contractKnown, unknownSev, d.kind === "native_transfer" ? "Plain transfer, no contract" : `${short(d.target)} is allowlisted`,
    `${short(d.target)} is not allowlisted${verifiedWarn ? " and has no verified source" : ""}: ${unknownSev === "pending" ? "a human decides" : "blocked"}`);
  // 7 function
  const fnOk = allowFns.has(d.fn);
  add("function", "Function allowlist", fnOk, contractKnown ? "block" : unknownSev, `${d.fn} is allowed`,
    `${d.fn} is not an allowed function${contractKnown ? "" : " on an unknown contract"}`);
  // 8 destination
  if (SPENDING.has(d.kind)) {
    const ok = p.recipients.map(lc).includes(d.recipient ?? "");
    add("destination", "Destination", ok, "block", `${short(d.recipient)} is an allowed recipient`, `${short(d.recipient)} is not on the recipient allowlist`);
  } else add("destination", "Destination", true, "block", "No direct recipient", "");
  // 9 limits
  const perTxOk = effective <= p.perTxUsd;
  add("per_tx", "Per-transaction limit", perTxOk, "block", `${f(effective)} is within the ${f(p.perTxUsd)} limit`,
    `${f(effective)} is over the ${f(p.perTxUsd)} per-transaction limit${effective > declaredUsd && simOut > declaredUsd ? ` (simulation shows the call moves more than it declares)` : ""}`);
  const day = rt.spends.filter((s) => s.ts > action.ts - DAY_MS).reduce((a, s) => a + s.usd, 0);
  const spendsNow = SPENDING.has(d.kind) || d.kind === "contract_call" ? Math.max(declaredUsd, simOut) : 0;
  add("daily", "Daily limit", day + spendsNow <= p.dailyUsd, "block", `${f(day + spendsNow)} of ${f(p.dailyUsd)} used in 24 h`, `Would reach ${f(day + spendsNow)} in 24 h, over the ${f(p.dailyUsd)} daily limit`);
  add("cumulative", "Lifetime cap", rt.cumulativeUsd + spendsNow <= p.cumulativeUsd, "block", `${f(rt.cumulativeUsd + spendsNow)} of ${f(p.cumulativeUsd)} lifetime cap`, `Would reach ${f(rt.cumulativeUsd + spendsNow)}, over the ${f(p.cumulativeUsd)} lifetime cap`);
  // 10 frequency
  const recent = rt.approvedTs.filter((t) => t > action.ts - p.quota.windowMs).length;
  add("frequency", "Transaction quota", recent < p.quota.maxTx, "block", `${recent} of ${p.quota.maxTx} transactions used in the window`,
    `${recent} transactions in the last ${Math.round(p.quota.windowMs / 60000)} min, quota is ${p.quota.maxTx}: runaway-agent guard`);
  // 11 human threshold
  if (p.humanApprovalAboveUsd !== undefined) add("human_threshold", "Human approval threshold", effective <= p.humanApprovalAboveUsd, "pending", `Under ${f(p.humanApprovalAboveUsd)}`, `${f(effective)} is above ${f(p.humanApprovalAboveUsd)}: needs a human`);
  // 12 simulation
  const moreThanSaid = simOut > declaredUsd + 0.005 && d.kind !== "approve";
  add("simulation", "Simulation", sim.ok && !moreThanSaid, "block", sim.balanceChanges.length ? `Balance change matches the request (${f(simOut)} out)` : "Simulation found no problem",
    !sim.ok ? `Simulation fails: ${sim.revertReason ?? "reverts"}` : `Simulation shows ${f(simOut)} leaving the wallet but the action declares ${f(declaredUsd)}: the call does more than it says`);

  if (i.humanApprovedBy)
    for (const r of rules) if (!r.ok && r.severity === "pending") { r.ok = true; r.severity = "info"; r.detail = `Approved by ${i.humanApprovedBy}: ${r.detail}`; }

  const failed = rules.filter((r) => !r.ok);
  const verdict: Verdict = failed.some((r) => r.severity === "block") ? "block" : failed.length ? "pending" : "approve";
  return { verdict, rules, reasons: failed.map((r) => r.detail), usd: Number.isFinite(effective) ? effective : p.perTxUsd * 1000 };
}
