// AUTO-COPIED from firewall/src/stateless.ts by scripts/sync-firewall.sh — do not edit here.
import { decode } from "./calldata";
import { evaluatePolicy, type AgentRuntime, type Evaluation } from "./policy";
import type { Simulator } from "./simulate";
import type { ThreatChecker } from "./threat";
import type { AgentPolicy, Decoded, RawAction } from "./types";

export interface StatelessInput {
  policy: AgentPolicy;
  /** runtime state rebuilt by the caller (e.g. from chain events) */
  rt: AgentRuntime;
  action: RawAction;
  simulator: Simulator;
  threat: ThreatChecker;
  extraSelectors?: Record<string, string>;
  killAll?: boolean;
  /** caller decides what counts as a fresh nonce (e.g. exactly the on-chain spend count) */
  nonceOk: boolean;
  humanApprovedBy?: string;
}
export interface StatelessResult extends Evaluation { decoded: Decoded; simulator: string; simNotes: string[] }

/** One-shot firewall decision with no stored state: used by the live API, where the chain is the state. */
export async function decideStateless(i: StatelessInput): Promise<StatelessResult> {
  const decoded = decode(i.action, i.extraSelectors);
  const findings = i.threat.check(decoded, i.policy);
  const sim = await i.simulator.simulate({ action: i.action, decoded });
  const ev = evaluatePolicy({ policy: i.policy, rt: i.rt, action: i.action, decoded, findings, sim, killAll: !!i.killAll, replay: { nonceOk: i.nonceOk, digestSeen: false }, humanApprovedBy: i.humanApprovedBy });
  return { ...ev, decoded, simulator: sim.simulator, simNotes: sim.notes };
}
