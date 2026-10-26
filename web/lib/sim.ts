/**
 * Demo simulation. Pure functions over a plain-JSON SimState so it can live in localStorage.
 * Uses the SAME state machine (agent/src/chainModel) and the SAME message engine (agent/src/engine, explain,
 * rules wording) as the real agent. Nothing here touches a network or a wallet.
 */
import * as M from "./agent/chainModel";
import { DAY, HOUR, type Snapshot } from "./agent/chainModel";
import { decide, fmtDate } from "./agent/engine";
import { nextSteps } from "./agent/explain";
import { rulesIntro } from "./agent/wording";
import type { Action, Audience, Contact, Stage, SwitchProfile } from "./agent/types";

export interface DemoGuardian { id: string; name: string; address?: string }
export interface DemoConfig {
  ownerName: string;
  beneficiaryName: string;
  beneficiaryAddress?: string;
  guardians: DemoGuardian[];
  threshold: number;
  intervalDays: number;
  graceDays: number;
  challengeDays: number;
  fallbackDays: number; // 0 = off
}

export type FeedKind = "chain" | "agent" | "you" | "sys";
export interface FeedItem {
  id: number;
  t: number;
  kind: FeedKind;
  title: string;
  body?: string;
  steps?: string[];
  urgent?: boolean;
}

export interface SimState {
  v: 2;
  cfg: DemoConfig;
  now: number;
  snap: Snapshot;
  sent: string[];
  feed: FeedItem[];
  seq: number;
  vaultStable: number;
  /** keys of owner/guardian escalations per epoch, to decide about all-clear */
  epochSeen: number;
}

export const DEFAULT_CFG: DemoConfig = {
  ownerName: "Ada",
  beneficiaryName: "Emeka",
  guardians: [
    { id: "g1", name: "Bola" },
    { id: "g2", name: "Chidi" },
    { id: "g3", name: "Dayo" },
  ],
  threshold: 2,
  intervalDays: 30,
  graceDays: 7,
  challengeDays: 3,
  fallbackDays: 30,
};

const contact = (id: string, name: string): Contact => ({ id, name, endpoints: [{ channel: "telegram-sim", address: id }] });

export function profileOf(cfg: DemoConfig): SwitchProfile {
  return {
    id: "demo",
    owner: contact("owner", cfg.ownerName),
    beneficiary: contact("beneficiary", cfg.beneficiaryName),
    guardians: cfg.guardians.map((g) => contact(g.id, g.name)),
  };
}

export function initSim(cfg: DemoConfig = DEFAULT_CFG, now = Math.floor(Date.now() / HOUR) * HOUR): SimState {
  const snap = M.newSnapshot(now, {
    intervalMs: cfg.intervalDays * DAY,
    graceMs: cfg.graceDays * DAY,
    challengeMs: cfg.challengeDays * DAY,
    fallbackMs: cfg.fallbackDays * DAY,
    threshold: cfg.threshold,
    guardianCount: cfg.guardians.length,
  });
  return {
    v: 2, cfg, now, snap, sent: [], seq: 1, vaultStable: 1250, epochSeen: 1,
    feed: [
      { id: 0, t: now, kind: "sys", title: "Simulation started", body: `${cfg.ownerName} checked in just now. Timer: ${cfg.intervalDays} days. Nothing here is on-chain.` },
    ],
  };
}

const clone = (s: SimState): SimState => structuredClone(s);
const push = (s: SimState, f: Omit<FeedItem, "id" | "t"> & { t?: number }) => {
  s.feed.unshift({ id: s.seq++, t: f.t ?? s.now, ...f });
  if (s.feed.length > 80) s.feed.length = 80;
};

const audLabel: Record<Audience, string> = { owner: "owner", guardians: "guardians", beneficiary: "beneficiary" };

function emitAgent(s: SimState, a: Action, p: SwitchProfile) {
  const who = a.audience === "owner" ? p.owner.name : a.audience === "beneficiary" ? p.beneficiary.name : `${p.guardians.length} guardians`;
  push(s, {
    kind: "agent",
    title: `Telegram (sim) → ${who}`,
    body: rulesIntro(a.facts),
    steps: nextSteps(a.facts),
    urgent: a.level >= 3,
    t: s.now,
  });
}

/** One deterministic agent tick at `s.now`. */
function agentTick(s: SimState) {
  const p = profileOf(s.cfg);
  const sent = new Set(s.sent);
  const plan = decide(p, s.snap, s.now, sent);
  for (const k of plan.skip) sent.add(k);
  for (const a of plan.send) {
    emitAgent(s, a, p);
    sent.add(a.key);
  }
  s.sent = [...sent];
}

/** Advances virtual time in 1-hour steps, running the agent each hour. */
export function advanceBy(state: SimState, ms: number): SimState {
  const s = clone(state);
  const end = s.now + ms;
  while (s.now < end) {
    s.now = Math.min(s.now + HOUR, end);
    agentTick(s);
  }
  return s;
}

export function advanceTo(state: SimState, t: number): SimState {
  return t <= state.now ? state : advanceBy(state, t - state.now);
}

export const statusOf = (s: SimState): M.Status => M.status(s.snap, s.now);

function allClear(s: SimState, prevEpoch: number) {
  const p = profileOf(s.cfg);
  const had = (aud: Audience, stages: Stage[]) =>
    s.sent.some((k) => {
      const [e, au, st] = k.split(":");
      return Number(e) === prevEpoch && au === aud && stages.includes(st as Stage);
    });
  const ownerEsc = had("owner", ["overdue", "final_warning", "challenge_started", "executable"]);
  const guardEsc = had("guardians", ["guardian_heads_up", "guardian_vote_open", "challenge_started", "executable"]);
  const mk = (aud: Audience): Action => {
    const facts = {
      ownerName: p.owner.name, recipientName: aud === "owner" ? p.owner.name : "guardian", beneficiaryName: p.beneficiary.name,
      stage: "all_clear" as Stage, audience: aud, tone: "friendly" as const, level: 1,
      deadline: fmtDate(M.expiry(s.snap)), interval: M.humanDuration(s.snap.intervalMs), graceLength: M.humanDuration(s.snap.graceMs),
      challengeLength: M.humanDuration(s.snap.challengeMs), approvalsHave: 0, approvalsNeed: s.snap.threshold, guardianTotal: s.snap.guardianCount,
    };
    return { key: "", stage: "all_clear", audience: aud, level: 1, tone: "friendly", facts };
  };
  if (ownerEsc) emitAgent(s, mk("owner"), p);
  if (guardEsc) emitAgent(s, mk("guardians"), p);
}

export function ownerCheckIn(state: SimState): SimState {
  const s = clone(state);
  if (s.snap.released || s.snap.closed) return s;
  const prev = s.snap.epoch;
  const { cancelled } = M.checkIn(s.snap, s.now);
  push(s, { kind: "you", title: `${s.cfg.ownerName} checks in`, body: cancelled ? "Release cancelled: all guardian votes wiped." : `Timer reset to ${s.cfg.intervalDays} days.` });
  if (cancelled) push(s, { kind: "chain", title: "ReleaseCancelled", body: "On-chain event: epoch bumped, votes void." });
  allClear(s, prev);
  return s;
}

export function guardianApprove(state: SimState, gid: string): SimState {
  const s = clone(state);
  const g = s.cfg.guardians.find((x) => x.id === gid);
  if (!g) return s;
  try {
    const r = M.approve(s.snap, s.now, gid);
    push(s, { kind: "chain", title: `GuardianApproved · ${g.name}`, body: `${s.snap.approvedBy.length} of ${s.snap.threshold} approvals.` });
    if (r.challengeStarted) push(s, { kind: "chain", title: "ChallengeStarted", body: `Owner can still cancel until ${fmtDate(s.snap.challengeEnd!)}.` });
  } catch (e) {
    push(s, { kind: "chain", title: `Revert · ${g.name}`, body: explainRevert((e as Error).message) });
  }
  agentTick(s);
  return s;
}

export function executeRelease(state: SimState): SimState {
  const s = clone(state);
  try {
    M.execute(s.snap, s.now);
    push(s, { kind: "chain", title: "Released", body: `${s.vaultStable.toLocaleString()} USD-stablecoin (simulated) sent to ${s.cfg.beneficiaryName}.` });
  } catch (e) {
    push(s, { kind: "chain", title: "Revert", body: explainRevert((e as Error).message) });
  }
  agentTick(s);
  return s;
}

export function pauseVault(state: SimState, days: number): SimState {
  const s = clone(state);
  const prev = s.snap.epoch;
  try {
    M.pause(s.snap, s.now, days * DAY);
    push(s, { kind: "you", title: `Vacation mode · ${days} days`, body: "Deadline moved out. Reminders paused." });
    allClear(s, prev);
  } catch (e) {
    push(s, { kind: "chain", title: "Revert", body: explainRevert((e as Error).message) });
  }
  return s;
}

export function explainRevert(m: string): string {
  return (
    {
      NotYetExpired: "Too early: guardians can only vote after deadline + grace. Collusion before expiry fails.",
      AlreadyApproved: "This guardian already voted. Double votes are rejected.",
      ChallengeRunning: "Threshold already reached; the challenge window is running.",
      ChallengeNotOver: "The challenge window is still open: the owner can still cancel.",
      Finished: "The vault is already released/closed.",
      BadParams: "Out of range.",
    } as Record<string, string>
  )[m] ?? m;
}

// ───────────────────────────── story helper ─────────────────────────────

export interface Suggestion {
  label: string;
  hint: string;
  run: (s: SimState) => SimState;
  alt?: { label: string; run: (s: SimState) => SimState };
}

export function nextSuggestion(s: SimState): Suggestion {
  const st = statusOf(s);
  const snap = s.snap;
  const owner = s.cfg.ownerName;
  switch (st) {
    case "active":
      return {
        label: `${owner} goes silent`,
        hint: `Skip ahead to just past the deadline (${fmtDate(M.expiry(snap))}). Watch the nudges and reminders go out.`,
        run: (x) => advanceTo(x, M.expiry(x.snap) + 2 * HOUR),
      };
    case "grace":
      return {
        label: "Grace period runs out",
        hint: "Still no reply. Reminders get louder and guardians get a heads-up.",
        run: (x) => advanceTo(x, M.graceEnd(x.snap) + HOUR),
      };
    case "awaiting_guardians":
      return {
        label: `Guardians vote (${snap.approvedBy.length}/${snap.threshold})`,
        hint: "Voting is open. The threshold of guardians approves the release to the beneficiary the owner chose.",
        run: (x) => {
          let y = x;
          for (const g of x.cfg.guardians) {
            if (y.snap.challengeEnd !== null) break;
            if (!y.snap.approvedBy.includes(g.id)) y = guardianApprove(y, g.id);
          }
          return y;
        },
      };
    case "challenge":
      return {
        label: "Let the window run out",
        hint: `Final challenge window. ${owner} can still cancel by checking in until ${fmtDate(snap.challengeEnd!)}.`,
        run: (x) => advanceTo(x, x.snap.challengeEnd! + HOUR),
        alt: { label: `${owner} returns & cancels`, run: ownerCheckIn },
      };
    case "executable":
      return {
        label: "Execute release",
        hint: `Window closed. Anyone can now execute: funds go to ${s.cfg.beneficiaryName}.`,
        run: executeRelease,
        alt: { label: `${owner} returns & cancels`, run: ownerCheckIn },
      };
    case "paused":
      return { label: "Skip past vacation", hint: "Vacation mode: the deadline is moved out.", run: (x) => advanceTo(x, x.snap.pausedUntil + HOUR) };
    case "released":
    case "closed":
      return { label: "Restart simulation", hint: "Funds were released (simulated). Start over.", run: (x) => initSim(x.cfg) };
  }
}

export function countdownTarget(s: SimState): { label: string; at: number | null } {
  switch (statusOf(s)) {
    case "active": return { label: "until check-in due", at: M.expiry(s.snap) };
    case "grace": return { label: "grace period left", at: M.graceEnd(s.snap) };
    case "awaiting_guardians": return { label: "guardians may vote now", at: null };
    case "challenge": return { label: "until release can execute", at: s.snap.challengeEnd };
    case "executable": return { label: "ready to execute", at: null };
    case "paused": return { label: "vacation ends in", at: s.snap.pausedUntil };
    case "released": return { label: "released to beneficiary", at: null };
    case "closed": return { label: "closed by owner", at: null };
  }
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return "0m";
  const d = Math.floor(ms / DAY), h = Math.floor((ms % DAY) / HOUR), m = Math.floor((ms % HOUR) / 60000);
  if (d > 0) return `${d}d ${String(h).padStart(2, "0")}h`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export const STORAGE_KEY = "heirloom-demo-v1";
export function loadSim(): SimState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as SimState;
    return j.v === 2 ? j : null;
  } catch { return null; }
}
export function saveSim(s: SimState) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ } }
export { audLabel, DAY, HOUR, fmtDate };
