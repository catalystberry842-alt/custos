// Builds the live firewall policy + runtime state from the CHAIN. No database: the vault's own config and events are the state.
import { formatEther } from "viem";
import { ThreatChecker, newRuntime, type AgentPolicy, type AgentRuntime } from "../firewall";
import type { ChainEvent, VaultSnapshot } from "./chain";
import { ATTACKER, DEPLOY, LIVE_UNIT } from "./config";

const ethNum = (wei: bigint) => Number(formatEther(wei));
export const FROZEN_WHY: Record<string, string> = {
  none: "this vault has no agent set",
  frozen_owner: "the owner pressed the kill switch on-chain",
  frozen_guardian: "a guardian froze the agent on-chain",
  frozen_lapsed: "the owner missed the check-in deadline, so the contract froze the agent",
  stopped: "the vault is released or closed",
};

export interface LiveState { policy: AgentPolicy; rt: AgentRuntime; nextNonce: number; spendCount: number }

/**
 * On-chain config becomes the firewall policy; firewall-only extras are fixed defaults (documented in docs/live.md):
 * ask-the-owner above 60% of the per-tx cap, a firewall daily budget of 4x the on-chain period cap, lifetime cap 20x.
 */
export function deriveLiveState(s: VaultSnapshot, events: ChainEvent[]): LiveState {
  const perTx = ethNum(s.perTxWei), perPeriod = ethNum(s.perPeriodWei);
  const spends = events.filter((e) => e.name === "AgentSpent" && String(e.args.asset).toLowerCase() === "0x0000000000000000000000000000000000000000")
    .map((e) => ({ ts: e.ts * 1000, usd: ethNum(e.args.amount as bigint) }));
  const rt = newRuntime();
  rt.spends = spends;
  rt.approvedTs = spends.map((x) => x.ts);
  rt.cumulativeUsd = spends.reduce((a, x) => a + x.usd, 0);
  const count = events.filter((e) => e.name === "AgentSpent").length;
  rt.lastNonce = count - 1;
  if (s.agentState !== "active") { rt.frozen = true; rt.frozenReason = FROZEN_WHY[s.agentState] ?? s.agentState; }
  const policy: AgentPolicy = {
    chainId: DEPLOY.chainId, unit: LIVE_UNIT,
    assets: { native: { symbol: "ETH", decimals: 18, usd: 1 } },
    contracts: [s.vault.toLowerCase()],
    functions: ["agentSpend"],
    recipients: s.recipients.map((r) => r.toLowerCase()),
    spenders: [],
    perTxUsd: perTx, dailyUsd: perPeriod * 4, cumulativeUsd: perPeriod * 20,
    quota: { maxTx: s.maxCalls || 6, windowMs: (s.periodSecs || 3600) * 1000 },
    humanApprovalAboveUsd: perTx * 0.6,
    unknownContract: "pending",
  };
  return { policy, rt, nextNonce: count, spendCount: count };
}
export const liveThreat = (vault: string) => new ThreatChecker({ knownBad: { [ATTACKER]: "on the demo known-bad list" }, verified: { [vault.toLowerCase()]: true } });
