// AUTO-COPIED from agent/src/engine.ts by scripts/sync-model.sh — do not edit here.
/**
 * engine.ts — DETERMINISTIC decisions. No I/O, no LLM, no randomness.
 * Given (profile, on-chain snapshot, now, already-sent keys) it returns exactly which messages are due.
 * The wording layer may only turn an Action's `facts` into prose; it can never add/remove/reorder actions.
 */
import {
  DAY, HOUR, expiry, graceEnd, humanDuration, status as chainStatus, anchor,
  type Snapshot, type Status,
} from "./chainModel";
import type { Action, Audience, MessageFacts, Plan, Stage, SwitchProfile, Tone } from "./types";

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
  };
}

function pick(entries: Entry[], now: number, sent: Set<string>, epoch: number): { send?: Entry; skip: Entry[] } {
  const due = entries.filter((x) => x.at <= now && !sent.has(actionKey(epoch, x)));
  if (due.length === 0) return { skip: [] };
  return { send: due[due.length - 1], skip: due.slice(0, -1) };
}

export const actionKey = (epoch: number, e: { audience: Audience; stage: Stage; step: number }) =>
  `${epoch}:${e.audience}:${e.stage}:${e.step}`;

export function decide(p: SwitchProfile, s: Snapshot, now: number, sent: Set<string>, cfg = reminderConfigFor(s)): Plan {
  const st = chainStatus(s, now);
  const plan: Plan = { send: [], skip: [] };

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
    e.audience === "owner" ? p.owner.name : e.audience === "beneficiary" ? p.beneficiary.name : "guardian";
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
