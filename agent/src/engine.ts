/**
 * engine.ts — DETERMINISTIC decisions. No I/O, no LLM, no randomness.
 * Given (profile, on-chain snapshot, now, already-sent keys) it returns exactly which messages are due.
 * The wording layer may only turn an Action's `facts` into prose; it can never add/remove/reorder actions.
 */
import {
  DAY, HOUR, agentAllowance, agentCutoff, agentState, expiry, graceEnd, humanDuration, isFrozen, status as chainStatus, anchor,
  type AgentEvent, type AgentState, type BlockReason, type Snapshot, type Status,
} from "./chainModel.js";
import type { Action, Audience, MessageFacts, Plan, Stage, SwitchProfile, Tone } from "./types.js";

export interface ReminderConfig {
  nudgeBeforeMs: number;
  reminderBeforeMs: number;
  /** number of overdue pings spread over the grace period */
  overdueSteps: number;
}

export function reminderConfigFor(s: Snapshot): ReminderConfig {
  return {
    nudgeBeforeMs: Math.min(7 * DAY, Math.floor(s.intervalMs / 3)),
    reminderBeforeMs: Math.min(1 * DAY, Math.floor(s.intervalMs / 10)),
    overdueSteps: 4,
  };
}

export function fmtDate(ms: number): string {
  const d = new Date(ms);
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${mon} ${d.getUTCFullYear()}, ${hh}:${mm} UTC`;
}

interface Entry {
  at: number;
  stage: Stage;
  step: number;
  level: number;
  audience: Audience;
}

const OWNER_OK: Status[] = ["active", "grace", "awaiting_guardians", "challenge", "executable"];

function ownerLadder(s: Snapshot, cfg: ReminderConfig): Entry[] {
  const e = expiry(s);
  const ge = graceEnd(s);
  const out: Entry[] = [
    { at: e - cfg.nudgeBeforeMs, stage: "nudge", step: 0, level: 0, audience: "owner" },
    { at: e - cfg.reminderBeforeMs, stage: "reminder", step: 0, level: 1, audience: "owner" },
  ];
  for (let k = 0; k < cfg.overdueSteps; k++) {
    out.push({
      at: e + Math.floor((k * s.graceMs) / cfg.overdueSteps) + (k === 0 ? 1 : 0),
      stage: "overdue",
      step: k,
      level: Math.min(2 + Math.floor(k / 2), 3),
      audience: "owner",
    });
  }
  out.push({ at: ge + 1, stage: "final_warning", step: 0, level: 4, audience: "owner" });
  if (s.challengeEnd !== null) {
    const start = s.challengeEnd - s.challengeMs;
    out.push({ at: start, stage: "challenge_started", step: 0, level: 4, audience: "owner" });
    out.push({ at: start + Math.floor(s.challengeMs / 2), stage: "challenge_started", step: 1, level: 4, audience: "owner" });
    out.push({ at: s.challengeEnd, stage: "executable", step: 0, level: 4, audience: "owner" });
  }
  return out.sort((a, b) => a.at - b.at);
}

function guardianLadder(s: Snapshot): Entry[] {
  const e = expiry(s);
  const ge = graceEnd(s);
  const out: Entry[] = [
    { at: e + Math.floor(s.graceMs / 2), stage: "guardian_heads_up", step: 0, level: 2, audience: "guardians" },
    { at: ge + 1, stage: "guardian_vote_open", step: 0, level: 3, audience: "guardians" },
  ];
  if (s.challengeEnd !== null) {
    out.push({ at: s.challengeEnd - s.challengeMs, stage: "challenge_started", step: 0, level: 3, audience: "guardians" });
    out.push({ at: s.challengeEnd, stage: "executable", step: 0, level: 3, audience: "guardians" });
  }
  return out.sort((a, b) => a.at - b.at);
}

function toneFor(stage: Stage, audience: Audience, level: number): Tone {
  if (stage === "agent_frozen" || stage === "agent_blocked" || stage === "agent_near_limit") return audience === "owner" && level >= 3 ? "urgent" : "firm";
  if (stage === "agent_spent" || stage === "agent_unfrozen") return audience === "owner" ? "friendly" : "calm";
  if (stage === "agent_handover") return "calm";
  if (audience !== "owner") return stage === "guardian_heads_up" || stage === "released" ? "calm" : "firm";
  if (stage === "challenge_started" || stage === "executable" || stage === "final_warning") return "urgent";
  if (stage === "released" || stage === "all_clear") return "calm";
  return level <= 1 ? "friendly" : "firm";
}

export function buildFacts(
  p: SwitchProfile, s: Snapshot, now: number, stage: Stage, audience: Audience, level: number, recipientName: string,
): MessageFacts {
  return {
    ownerName: p.owner.name,
    recipientName,
    beneficiaryName: p.beneficiary.name,
    stage,
    audience,
    tone: toneFor(stage, audience, level),
    level,
    timeLeft: humanDuration(expiry(s) - now),
    deadline: fmtDate(expiry(s)),
    graceEnd: fmtDate(graceEnd(s)),
    challengeEnd: s.challengeEnd !== null ? fmtDate(s.challengeEnd) : undefined,
    interval: humanDuration(s.intervalMs),
    graceLength: humanDuration(s.graceMs),
    challengeLength: humanDuration(s.challengeMs),
    approvalsHave: s.approvedBy.length,
    approvalsNeed: s.threshold,
    guardianTotal: s.guardianCount,
    outcome: s.pendingOutcome ?? "release",
    agentName: s.agent?.name,
    successorName: s.successorName ?? p.successor?.name,
    cutoffText: s.agent ? fmtDate(agentCutoff(s)) : undefined,
  };
}

// ───────────────────────────── managed AI agent: formatting ─────────────────────────────

/** Payee / agent names can come from an AI or its tools: make them short, plain, link-free before display. */
export const safeLabel = (v: string): string =>
  v.replace(/https?:\/\/\S+|www\.\S+/gi, "[link]").replace(/[^\p{L}\p{N} .,'@_:/-]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 40) || "unknown";

const STABLES = new Set(["USDC", "USDG", "USDT", "USD", "DAI"]);
export function fmtAmount(asset: string, n: number): string {
  const v = Math.round(n * 100) / 100;
  const txt = Number.isInteger(v) ? String(v) : v.toFixed(2);
  return STABLES.has(asset) ? `$${txt}` : `${txt} ${asset}`;
}
export function periodWord(ms: number): string {
  if (ms === 24 * HOUR) return "day";
  if (ms === 7 * 24 * HOUR) return "week";
  if (ms === HOUR) return "hour";
  return humanDuration(ms);
}
const REASON_TEXT: Record<BlockReason, string> = {
  over_per_tx: "that is above the per-payment limit you set",
  over_period: "that would go over the spending budget you set for this period",
  recipient_not_allowed: "that recipient is not on your allowed list",
  asset_not_allowed: "that asset is not on your allowed list",
  frozen: "your agent is frozen",
};
const FREEZE_OF: Record<string, "lapsed" | "guardian" | "owner"> = {
  frozen_lapsed: "lapsed", frozen_guardian: "guardian", frozen_owner: "owner",
};

/** The profile the monitoring agent should talk to NOW: after a Handover the successor is the owner. */
export function effectiveProfile(p: SwitchProfile, s: Snapshot): SwitchProfile {
  return s.handover && p.successor ? { ...p, owner: p.successor, successor: undefined } : p;
}

function agentFacts(
  p: SwitchProfile, s: Snapshot, now: number, stage: Stage, aud: Audience, level: number, rcpt: string,
  extra: Partial<MessageFacts> = {}, asset?: string,
): MessageFacts {
  const f = buildFacts(p, s, now, stage, aud, level, rcpt);
  const a = s.agent;
  const al = a && (asset ?? a.limits[0]?.asset) ? agentAllowance(s, now, asset ?? a.limits[0]!.asset) : null;
  const sym = asset ?? a?.limits[0]?.asset ?? "";
  if (a && al) {
    f.limitText = `${fmtAmount(sym, al.perPeriod)} per ${periodWord(a.periodMs)}, at most ${fmtAmount(sym, al.perTx)} per payment`;
    f.usedText = fmtAmount(sym, al.spent);
    f.remainingText = fmtAmount(sym, Math.max(al.remaining, 0));
    f.windowResets = al.resetsAt ? fmtDate(al.resetsAt) : undefined;
  }
  return { ...f, ...extra };
}

/** Event-driven keys must not depend on the epoch (events outlive owner check-ins). */
const evKey = (aud: Audience, stage: Stage, step: number | string) => `0:${aud}:${stage}:${step}`;

/**
 * Deterministic decisions about the managed AI agent. Same rules as everything else here: pure, idempotent,
 * and after downtime only the latest item per kind is sent (the rest are marked skipped).
 */
export function decideAgent(p: SwitchProfile, s: Snapshot, now: number, sent: Set<string>, events: AgentEvent[]): Plan {
  const plan: Plan = { send: [], skip: [] };
  const add = (stage: Stage, aud: Audience, level: number, key: string, facts: MessageFacts) =>
    plan.send.push({ key, stage, audience: aud, level, tone: toneFor(stage, aud, level), facts });

  // ── after a Handover: tell the old owner, the successor and the guardians (once) ──
  if (s.handover) {
    for (const aud of ["owner", "successor", "guardians"] as Audience[]) {
      if (aud === "successor" && !p.successor) continue;
      const key = `${s.handover.epoch}:${aud}:agent_handover:0`;
      if (sent.has(key)) continue;
      const rcpt = aud === "owner" ? p.owner.name : aud === "successor" ? p.successor!.name : "guardian";
      add("agent_handover", aud, 1, key, { ...buildFacts(p, s, now, "agent_handover", aud, 1, rcpt), successorName: s.handover.toName, agentName: s.handover.agentName });
    }
  }
  const a = s.agent;
  if (!a || s.released || s.closed) return plan;

  const mine = events.filter((e) => e.kind === "spend");
  const unsentSpends = mine.filter((e) => !sent.has(evKey("owner", "agent_spent", e.id)));
  if (unsentSpends.length) {
    const last = unsentSpends[unsentSpends.length - 1]!;
    for (const e of unsentSpends.slice(0, -1)) plan.skip.push(evKey("owner", "agent_spent", e.id));
    const total = unsentSpends.filter((e) => e.asset === last.asset).reduce((t, e) => t + e.amount, 0);
    add("agent_spent", "owner", 0, evKey("owner", "agent_spent", last.id),
      agentFacts(p, s, now, "agent_spent", "owner", 0, p.owner.name,
        { amountText: fmtAmount(last.asset, last.amount), payee: safeLabel(last.to), spendCount: unsentSpends.length, totalText: fmtAmount(last.asset, total) }, last.asset));
  }

  const unsentBlocked = events.filter((e) => e.kind === "blocked" && !sent.has(evKey("owner", "agent_blocked", e.id)));
  if (unsentBlocked.length) {
    const last = unsentBlocked[unsentBlocked.length - 1]!;
    for (const e of unsentBlocked.slice(0, -1)) plan.skip.push(evKey("owner", "agent_blocked", e.id));
    add("agent_blocked", "owner", last.reason === "frozen" ? 2 : 3, evKey("owner", "agent_blocked", last.id),
      agentFacts(p, s, now, "agent_blocked", "owner", last.reason === "frozen" ? 2 : 3, p.owner.name,
        { amountText: fmtAmount(last.asset, last.amount), payee: safeLabel(last.to), spendCount: unsentBlocked.length, blockText: REASON_TEXT[last.reason ?? "over_period"] }, last.asset));
  }

  // nearing / hitting a spending budget (once per asset per window)
  const near = a.limits
    .map((l) => ({ l, al: agentAllowance(s, now, l.asset)! }))
    .filter((x) => x.al.spent > 0 && x.al.spent / x.al.perPeriod >= 0.8 && x.l.periodStart > 0)
    .sort((x, y) => y.al.spent / y.al.perPeriod - x.al.spent / x.al.perPeriod);
  if (near.length) {
    const x = near[0]!;
    const key = evKey("owner", "agent_near_limit", `${x.l.asset}@${x.l.periodStart}`);
    if (!sent.has(key)) add("agent_near_limit", "owner", 1, key, agentFacts(p, s, now, "agent_near_limit", "owner", 1, p.owner.name, {}, x.l.asset));
  }

  // frozen / unfrozen
  const st: AgentState = agentState(s, now);
  if (isFrozen(st)) {
    const reason = FREEZE_OF[st]!;
    const auds: Audience[] = reason === "owner" ? ["owner"] : ["owner", "guardians"];
    for (const aud of auds) {
      const key = actionKey(s.epoch, { audience: aud, stage: "agent_frozen", step: 0 }).replace(/:0$/, `:${st}`);
      if (sent.has(key)) continue;
      const rcpt = aud === "owner" ? p.owner.name : "guardian";
      add("agent_frozen", aud, aud === "owner" ? 3 : 2, key, agentFacts(p, s, now, "agent_frozen", aud, aud === "owner" ? 3 : 2, rcpt, { freezeReason: reason }));
    }
  } else if (st === "active") {
    const epochsOf = (stage: string) => [...sent].filter((k) => k.split(":")[2] === stage && k.split(":")[1] === "owner").map((k) => Number(k.split(":")[0]));
    const fe = Math.max(-1, ...epochsOf("agent_frozen"));
    const ue = Math.max(-1, ...epochsOf("agent_unfrozen"));
    const key = actionKey(s.epoch, { audience: "owner", stage: "agent_unfrozen", step: 0 });
    if (fe >= 0 && fe < s.epoch && ue < fe && !sent.has(key)) {
      add("agent_unfrozen", "owner", 1, key, agentFacts(p, s, now, "agent_unfrozen", "owner", 1, p.owner.name));
      const gk = actionKey(s.epoch, { audience: "guardians", stage: "agent_unfrozen", step: 0 });
      if (!sent.has(gk)) add("agent_unfrozen", "guardians", 1, gk, agentFacts(p, s, now, "agent_unfrozen", "guardians", 1, "guardian"));
    }
  }
  return plan;
}

function pick(entries: Entry[], now: number, sent: Set<string>, epoch: number): { send?: Entry; skip: Entry[] } {
  const due = entries.filter((x) => x.at <= now && !sent.has(actionKey(epoch, x)));
  if (due.length === 0) return { skip: [] };
  return { send: due[due.length - 1], skip: due.slice(0, -1) };
}

export const actionKey = (epoch: number, e: { audience: Audience; stage: Stage; step: number }) =>
  `${epoch}:${e.audience}:${e.stage}:${e.step}`;

export function decide(
  p0: SwitchProfile, s: Snapshot, now: number, sent: Set<string>, cfg = reminderConfigFor(s), events: AgentEvent[] = [],
): Plan {
  const p = effectiveProfile(p0, s); // after a Handover the successor is "the owner" for the normal ladder
  const st = chainStatus(s, now);
  const plan: Plan = { send: [], skip: [] };
  const ag = decideAgent(p0, s, now, sent, events);
  plan.send.push(...ag.send);
  plan.skip.push(...ag.skip);

  if (st === "closed" || st === "paused") return plan;

  if (st === "released") {
    for (const aud of ["owner", "guardians", "beneficiary"] as Audience[]) {
      const e: Entry = { at: 0, stage: "released", step: 0, level: 4, audience: aud };
      const k = actionKey(s.epoch, e);
      if (!sent.has(k)) plan.send.push(mk(p, s, now, e, k));
    }
    // everything else for this epoch is moot
    return plan;
  }

  if (!OWNER_OK.includes(st)) return plan;

  const ladders: [Entry[], boolean][] = [
    [ownerLadder(s, cfg), true],
    [guardianLadder(s), true],
  ];
  for (const [entries] of ladders) {
    const { send, skip } = pick(entries, now, sent, s.epoch);
    for (const sk of skip) plan.skip.push(actionKey(s.epoch, sk));
    if (send) plan.send.push(mk(p, s, now, send, actionKey(s.epoch, send)));
  }
  return plan;
}

function mk(p: SwitchProfile, s: Snapshot, now: number, e: Entry, key: string): Action {
  const recipientName =
    e.audience === "owner" ? p.owner.name : e.audience === "beneficiary" ? p.beneficiary.name : e.audience === "successor" ? (p.successor?.name ?? "successor") : "guardian";
  return {
    key,
    stage: e.stage,
    audience: e.audience,
    level: e.level,
    tone: toneFor(e.stage, e.audience, e.level),
    facts: buildFacts(p, s, now, e.stage, e.audience, e.level, recipientName),
  };
}

export { anchor, HOUR };
