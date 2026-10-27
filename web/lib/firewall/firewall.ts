// AUTO-COPIED from firewall/src/firewall.ts by scripts/sync-firewall.sh — do not edit here.
import { decode, lc } from "./calldata";
import { AuditLog, slimRules, type AuditEntry } from "./audit";
import { evaluatePolicy, newRuntime, DAY_MS, type AgentRuntime, type Evaluation } from "./policy";
import { canonical, sha256Hex } from "./sha256";
import type { Simulator } from "./simulate";
import type { ThreatChecker } from "./threat";
import type { AgentPolicy, Decision, Decoded, ExecResult, Pending, RawAction } from "./types";

export interface RegisteredAgent { id: string; name: string; policy: AgentPolicy; policyHash: string; runtime: AgentRuntime }
export interface FirewallOptions { simulator: Simulator; threat: ThreatChecker; extraSelectors?: Record<string, string> }

export const policyHash = (p: AgentPolicy) => sha256Hex(canonical(p));

/**
 * The Agent Firewall. Sits BETWEEN an agent and its signer. The agent can propose anything; only actions that pass
 * every rule are released. Rules live here, outside the model: a jailbroken or prompt-injected agent still cannot
 * sign anything that this code refuses. Every decision lands in a hash-chained audit log.
 */
export class Firewall {
  readonly audit: AuditLog;
  agents = new Map<string, RegisteredAgent>();
  pending: Pending[] = [];
  killAll = false;
  private nextPending = 1;

  constructor(public opts: FirewallOptions, audit?: AuditLog) { this.audit = audit ?? new AuditLog(); }

  // ───────────── registry and controls ─────────────
  registerAgent(id: string, name: string, policy: AgentPolicy, ts: number): RegisteredAgent {
    const a: RegisteredAgent = { id, name, policy, policyHash: policyHash(policy), runtime: newRuntime() };
    this.agents.set(id, a);
    this.audit.append({ ts, type: "register", agentId: id, agentName: name, summary: `Registered agent "${name}" with policy ${a.policyHash.slice(0, 8)}`, policyHash: a.policyHash });
    return a;
  }
  updatePolicy(id: string, policy: AgentPolicy, ts: number, actor = "owner") {
    const a = this.must(id);
    a.policy = policy;
    a.policyHash = policyHash(policy);
    this.audit.append({ ts, type: "policy", agentId: id, agentName: a.name, summary: `${actor} changed the policy (now ${a.policyHash.slice(0, 8)})`, policyHash: a.policyHash, actor });
  }
  /** Emergency kill switch. `agentId` omitted = every agent. */
  setKillSwitch(on: boolean, ts: number, agentId?: string, actor = "owner") {
    if (agentId) {
      const a = this.must(agentId);
      a.runtime.frozen = on;
      a.runtime.frozenReason = on ? `kill switch set by ${actor}` : undefined;
      if (!on) a.runtime.blockedTs = [];
      this.audit.append({ ts, type: "control", agentId, agentName: a.name, summary: `Kill switch ${on ? "ON" : "off"} for ${a.name} (${actor})`, actor, policyHash: a.policyHash });
    } else {
      this.killAll = on;
      this.audit.append({ ts, type: "control", agentId: "*", agentName: "all agents", summary: `Emergency kill switch ${on ? "ON" : "off"} for ALL agents (${actor})`, actor });
    }
  }
  private must(id: string) { const a = this.agents.get(id); if (!a) throw new Error(`unknown agent ${id}`); return a; }

  // ───────────── the main entry point ─────────────
  async submit(action: RawAction): Promise<Decision> {
    const agent = this.agents.get(action.agentId);
    if (!agent) {
      const e = this.audit.append({ ts: action.ts, type: "decision", agentId: action.agentId, agentName: "(unregistered)", summary: "Unregistered agent tried to act", decision: "block",
        reasons: ["Agent is not registered with the firewall"], rules: [{ rule: "registered", ok: false, severity: "block", detail: "Agent is not registered with the firewall" }] });
      return { verdict: "block", agentId: action.agentId, auditIndex: e.index, rules: [{ rule: "registered", label: "Registered agent", ok: false, severity: "block", detail: "Agent is not registered with the firewall" }], reasons: ["Agent is not registered with the firewall"] };
    }
    const rt = agent.runtime;
    const decoded = decode(action, this.opts.extraSelectors);
    const digest = sha256Hex(canonical({ ...action, ts: undefined }));
    const replay = { nonceOk: action.nonce > rt.lastNonce, digestSeen: rt.seen.includes(digest) };
    const findings = this.opts.threat.check(decoded, agent.policy);
    const sim = await this.opts.simulator.simulate({ action, decoded });
    const ev = evaluatePolicy({ policy: agent.policy, rt, action, decoded, findings, sim, killAll: this.killAll, replay });

    if (replay.nonceOk) { rt.lastNonce = action.nonce; rt.seen.push(digest); if (rt.seen.length > 500) rt.seen.shift(); }
    const entry = this.record(agent, action, decoded, ev, "decision");
    const out: Decision = { verdict: ev.verdict, agentId: agent.id, auditIndex: entry.index, rules: ev.rules, reasons: ev.reasons, decoded, usd: ev.usd };

    if (ev.verdict === "approve") this.countSpend(agent, action, decoded, ev);
    else if (ev.verdict === "block") this.noteBlock(agent, action.ts, ev);
    else {
      const p: Pending = { id: this.nextPending++, auditIndex: entry.index, action, decoded, rules: ev.rules, reasons: ev.reasons, usd: ev.usd, status: "open" };
      this.pending.push(p);
      out.pendingId = p.id;
    }
    return out;
  }

  /** A human resolves a pending action. Approving re-checks every HARD rule at that moment (kill switch, limits…). */
  async resolvePending(id: number, resolution: "approve" | "deny", actor: string, ts: number): Promise<Decision> {
    const p = this.pending.find((x) => x.id === id && x.status === "open");
    if (!p) throw new Error(`no open pending approval #${id}`);
    const agent = this.must(p.action.agentId);
    if (resolution === "deny") {
      p.status = "denied";
      const e = this.audit.append({ ts, type: "resolution", agentId: agent.id, agentName: agent.name, summary: `${actor} DENIED pending #${id}`, decision: "block", ref: p.auditIndex, actor, policyHash: agent.policyHash, reasons: ["Denied by a human"] });
      return { verdict: "block", agentId: agent.id, auditIndex: e.index, rules: p.rules, reasons: ["Denied by a human"], decoded: p.decoded, usd: p.usd };
    }
    const sim = await this.opts.simulator.simulate({ action: p.action, decoded: p.decoded });
    const findings = this.opts.threat.check(p.decoded, agent.policy);
    const ev = evaluatePolicy({ policy: agent.policy, rt: agent.runtime, action: p.action, decoded: p.decoded, findings, sim, killAll: this.killAll,
      replay: { nonceOk: true, digestSeen: false }, humanApprovedBy: actor });
    const entry = this.record(agent, { ...p.action, ts }, p.decoded, ev, "resolution", { ref: p.auditIndex, actor });
    if (ev.verdict === "approve") { p.status = "approved"; this.countSpend(agent, { ...p.action, ts }, p.decoded, ev); }
    else if (ev.verdict === "block") { p.status = "denied"; this.noteBlock(agent, ts, ev); }
    return { verdict: ev.verdict, agentId: agent.id, auditIndex: entry.index, rules: ev.rules, reasons: ev.reasons, decoded: p.decoded, usd: ev.usd };
  }

  /** Record what happened after an approved action was sent to the signer / chain. */
  reportResult(auditIndex: number, result: ExecResult, ts: number) {
    const ref = this.audit.entries[auditIndex];
    if (!ref) throw new Error("no such audit entry");
    this.audit.append({ ts, type: "result", agentId: ref.agentId, agentName: ref.agentName, summary: result.ok ? `Executed: ${result.detail}` : `Execution failed: ${result.detail}`, ref: auditIndex, result, policyHash: ref.policyHash });
  }

  // ───────────── internals ─────────────
  private record(agent: RegisteredAgent, action: RawAction, d: Decoded, ev: Evaluation, type: "decision" | "resolution", extra: Partial<AuditEntry> = {}): AuditEntry {
    const verb = ev.verdict === "approve" ? "APPROVED" : ev.verdict === "block" ? "BLOCKED" : "PENDING human approval";
    return this.audit.append({
      ts: action.ts, type, agentId: agent.id, agentName: agent.name, policyHash: agent.policyHash,
      summary: `${agent.name} → ${d.fn}${d.recipient ? " to " + d.recipient.slice(0, 6) + "…" + d.recipient.slice(-4) : ""}: ${verb}`,
      action: { nonce: action.nonce, to: lc(action.to), fn: d.fn, asset: d.asset, recipient: d.recipient, spender: d.spender, usd: Math.round(ev.usd * 100) / 100, intent: action.intent },
      rules: slimRules(ev.rules), decision: ev.verdict, reasons: ev.reasons, ...extra,
    });
  }
  private countSpend(agent: RegisteredAgent, action: RawAction, d: Decoded, ev: Evaluation) {
    const rt = agent.runtime;
    rt.approvedTs.push(action.ts);
    if (d.kind === "approve") return; // an allowance is exposure, not a spend
    rt.spends.push({ ts: action.ts, usd: ev.usd });
    rt.spends = rt.spends.filter((s) => s.ts > action.ts - 2 * DAY_MS);
    rt.cumulativeUsd += ev.usd;
  }
  private noteBlock(agent: RegisteredAgent, ts: number, ev: Evaluation) {
    if (ev.rules.some((r) => r.rule === "kill_switch" && !r.ok)) return;
    const b = agent.policy.breaker;
    if (!b) return;
    const rt = agent.runtime;
    rt.blockedTs = [...rt.blockedTs.filter((t) => t > ts - b.windowMs), ts];
    if (rt.blockedTs.length >= b.blocks && !rt.frozen) {
      rt.frozen = true;
      rt.frozenReason = `circuit breaker: ${rt.blockedTs.length} blocked actions in ${Math.round(b.windowMs / 60000)} min`;
      this.audit.append({ ts, type: "control", agentId: agent.id, agentName: agent.name, summary: `Circuit breaker tripped for ${agent.name}: ${rt.frozenReason}. Agent frozen until a human resets it.`, policyHash: agent.policyHash, actor: "firewall" });
    }
  }

  // ───────────── persistence (JSON with bigint support) ─────────────
  serialize(): string {
    return JSON.stringify({ agents: [...this.agents.values()], pending: this.pending, killAll: this.killAll, nextPending: this.nextPending, audit: this.audit.entries }, (_k, v) => (typeof v === "bigint" ? { $big: v.toString() } : v));
  }
  static restore(json: string, opts: FirewallOptions): Firewall {
    const o = JSON.parse(json, (_k, v) => (v && typeof v === "object" && "$big" in v ? BigInt(v.$big) : v));
    const fw = new Firewall(opts, new AuditLog(o.audit));
    for (const a of o.agents) fw.agents.set(a.id, a);
    fw.pending = o.pending; fw.killAll = o.killAll; fw.nextPending = o.nextPending;
    return fw;
  }
}
