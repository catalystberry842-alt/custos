// AUTO-COPIED from firewall/src/threat.ts by scripts/sync-firewall.sh — do not edit here.
import { lc } from "./calldata";
import type { AgentPolicy, Decoded } from "./types";

export interface ThreatFinding { code: "known_bad" | "lookalike" | "unlimited_approval" | "unverified_contract"; level: "warn" | "critical"; address?: string; detail: string }

export interface ThreatIntel {
  /** address → why it is bad (scam, drainer, sanctioned…) */
  knownBad: Record<string, string>;
  /** contract address → verified source? Missing = unknown/unverified */
  verified: Record<string, boolean>;
}

const short = (a: string) => a.slice(0, 6) + "…" + a.slice(-4);
const look = (a: string) => a.slice(2, 6) + a.slice(-4);

/**
 * Simple threat-check service. Pluggable data (known-bad list, verification status); the checks themselves are
 * deterministic: known-bad address, address-poisoning lookalike, unlimited approvals, unverified contracts.
 */
export class ThreatChecker {
  constructor(public intel: ThreatIntel) {}
  check(d: Decoded, policy: AgentPolicy): ThreatFinding[] {
    const out: ThreatFinding[] = [];
    const seen = new Set<string>();
    for (const a of [d.recipient, d.spender, d.target]) {
      if (!a || seen.has(a)) continue;
      seen.add(a);
      const why = this.intel.knownBad[a];
      if (why) out.push({ code: "known_bad", level: "critical", address: a, detail: `${short(a)} is on the known-bad list: ${why}` });
    }
    if (d.recipient && !policy.recipients.map(lc).includes(d.recipient)) {
      const twin = policy.recipients.map(lc).find((r) => look(r) === look(d.recipient!));
      if (twin) out.push({ code: "lookalike", level: "critical", address: d.recipient, detail: `${short(d.recipient)} imitates the allowlisted ${short(twin)} (same first and last characters): classic address poisoning` });
    }
    if (d.unlimited) out.push({ code: "unlimited_approval", level: "critical", address: d.spender, detail: `${d.fn} would give ${d.spender ? short(d.spender) : "a spender"} unlimited access to the tokens` });
    if (d.kind === "contract_call" && this.intel.verified[d.target] !== true)
      out.push({ code: "unverified_contract", level: "warn", address: d.target, detail: `${short(d.target)} has no verified source code` });
    return out;
  }
}
