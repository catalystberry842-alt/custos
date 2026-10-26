// AUTO-COPIED from agent/src/chainModel.ts by scripts/sync-model.sh — do not edit here.
/**
 * chainModel.ts — pure, dependency-free mirror of the Custos contract's state machine.
 *
 * Used by: the agent (SimChain + deciding what to say) and, via scripts/sync-model.sh, the web demo.
 * Keep semantically identical to contracts/src/Custos.sol (status(), anchor(), approve, touch, and the AI-agent
 * layer: agentState(), agentSpend(), guardianFreezeAgent(), Handover).
 * All times are milliseconds since epoch.
 */
export const SEC = 1000;
export const MIN = 60 * SEC;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export type Status =
  | "active"
  | "grace"
  | "awaiting_guardians"
  | "challenge"
  | "executable"
  | "paused"
  | "released"
  | "closed";

export type Outcome = "release" | "handover";

export type AgentState = "none" | "active" | "frozen_owner" | "frozen_guardian" | "frozen_lapsed" | "stopped";

export interface AssetLimitModel {
  /** symbol, e.g. "USDC" or "ETH" (the real contract keys by token address; address(0) = ETH) */
  asset: string;
  perTx: number;
  perPeriod: number;
  /** 0 = no window running */
  periodStart: number;
  spent: number;
}

/** The AI agent layer of a vault (mirror of the contract's agent fields). Absent = no agent authorised. */
export interface AgentModel {
  name: string;
  periodMs: number;
  /** how long past the check-in deadline the agent may keep spending (clamped to grace) */
  lateAllowanceMs: number;
  ownerFrozen: boolean;
  /** == Snapshot.epoch ⇒ frozen by a guardian; any owner action bumps the epoch and thereby unfreezes */
  guardianFrozenEpoch: number;
  limits: AssetLimitModel[];
  /** allowlisted payees (names/addresses) */
  recipients: string[];
}

export type BlockReason = "over_per_tx" | "over_period" | "recipient_not_allowed" | "asset_not_allowed" | "frozen";

/** One thing the managed AI agent did (or tried to do). Fed by a ManagedAgentAdapter. */
export interface AgentEvent {
  id: number;
  at: number;
  kind: "spend" | "blocked";
  asset: string;
  to: string;
  amount: number;
  reason?: BlockReason;
}

export interface Snapshot {
  intervalMs: number;
  graceMs: number;
  challengeMs: number;
  /** 0 = no guardian-less fallback */
  fallbackMs: number;
  lastCheckIn: number;
  pausedUntil: number;
  epoch: number;
  threshold: number;
  guardianCount: number;
  /** ids/addresses of guardians that approved in the current epoch */
  approvedBy: string[];
  challengeEnd: number | null;
  released: boolean;
  closed: boolean;
  // ── AI-agent layer (all optional: a plain switch has none of this) ──
  agent?: AgentModel;
  /** named heir of the AGENT's role + funds if guardians vote Handover */
  successorName?: string;
  pendingOutcome?: Outcome;
  /** guardian id → what they voted for in the current epoch */
  outcomeBy?: Record<string, Outcome>;
  /** set once a Handover executed (the vault continues under the successor) */
  handover?: { at: number; toName: string; epoch: number; agentName?: string };
}

export const anchor = (s: Snapshot) => Math.max(s.lastCheckIn, s.pausedUntil);
export const expiry = (s: Snapshot) => anchor(s) + s.intervalMs;
export const graceEnd = (s: Snapshot) => anchor(s) + s.intervalMs + s.graceMs;
export const fallbackOpensAt = (s: Snapshot) => (s.fallbackMs ? graceEnd(s) + s.fallbackMs : null);

export function status(s: Snapshot, now: number): Status {
  if (s.released) return "released";
  if (s.closed) return "closed";
  if (now < s.pausedUntil) return "paused";
  if (s.challengeEnd !== null) return now >= s.challengeEnd ? "executable" : "challenge";
  if (now <= expiry(s)) return "active";
  if (now <= graceEnd(s)) return "grace";
  return "awaiting_guardians";
}

export class ModelError extends Error {}

/** Owner proof-of-life: resets timer, bumps epoch, voids votes/challenge. Returns whether a release was cancelled. */
export function checkIn(s: Snapshot, now: number): { cancelled: boolean } {
  if (s.released || s.closed) throw new ModelError("Finished");
  const cancelled = s.challengeEnd !== null || s.approvedBy.length > 0;
  s.lastCheckIn = now;
  s.epoch += 1;
  s.approvedBy = [];
  s.outcomeBy = {};
  s.pendingOutcome = "release";
  s.challengeEnd = null;
  return { cancelled };
}

export function pause(s: Snapshot, now: number, durationMs: number): void {
  if (durationMs <= 0 || durationMs > 90 * DAY) throw new ModelError("BadParams");
  if (s.released || s.closed) throw new ModelError("Finished");
  s.pausedUntil = now + durationMs;
  checkIn(s, now);
}

export function approve(
  s: Snapshot, now: number, guardianId: string, outcome: Outcome = "release",
): { challengeStarted: boolean } {
  if (s.released || s.closed) throw new ModelError("Finished");
  if (now <= graceEnd(s)) throw new ModelError("NotYetExpired");
  if (s.challengeEnd !== null) throw new ModelError("ChallengeRunning");
  if (s.approvedBy.includes(guardianId)) throw new ModelError("AlreadyApproved");
  if (outcome === "handover" && !s.successorName) throw new ModelError("NoSuccessor");
  s.approvedBy.push(guardianId);
  s.outcomeBy = { ...(s.outcomeBy ?? {}), [guardianId]: outcome };
  const votes = Object.values(s.outcomeBy).filter((o) => o === outcome).length;
  if (votes >= s.threshold) {
    s.challengeEnd = now + s.challengeMs;
    s.pendingOutcome = outcome;
    return { challengeStarted: true };
  }
  return { challengeStarted: false };
}

export function execute(s: Snapshot, now: number): void {
  if (s.released || s.closed) throw new ModelError("Finished");
  if (s.challengeEnd === null) throw new ModelError("NotYetExpired");
  if (now < s.challengeEnd) throw new ModelError("ChallengeNotOver");
  if (s.pendingOutcome === "handover") {
    // ownership + funds pass to the successor; the agent is revoked until the new owner re-authorises one
    s.handover = { at: now, toName: s.successorName ?? "successor", epoch: s.epoch + 1, agentName: s.agent?.name };
    s.successorName = undefined;
    s.agent = undefined;
    s.pausedUntil = 0;
    s.lastCheckIn = now;
    s.epoch += 1;
    s.approvedBy = [];
    s.outcomeBy = {};
    s.challengeEnd = null;
    s.pendingOutcome = "release";
    return;
  }
  s.released = true;
  s.challengeEnd = null;
}

// ───────────────────────────── AI agent layer ─────────────────────────────

/** Last moment (inclusive) the agent may still spend: expiry + min(lateAllowance, grace). */
export const agentCutoff = (s: Snapshot) => expiry(s) + Math.min(s.agent?.lateAllowanceMs ?? 0, s.graceMs);

export function agentState(s: Snapshot, now: number): AgentState {
  if (!s.agent) return "none";
  if (s.released || s.closed) return "stopped";
  if (s.agent.ownerFrozen) return "frozen_owner";
  if (s.agent.guardianFrozenEpoch === s.epoch) return "frozen_guardian";
  if (s.challengeEnd !== null || now > agentCutoff(s)) return "frozen_lapsed";
  return "active";
}

export const isFrozen = (st: AgentState) => st === "frozen_owner" || st === "frozen_guardian" || st === "frozen_lapsed";

/** Remaining budget for `asset` in the current window (full budget if no window is running). */
export function agentAllowance(s: Snapshot, now: number, asset: string) {
  const a = s.agent;
  const l = a?.limits.find((x) => x.asset === asset);
  if (!a || !l) return null;
  const windowOver = l.periodStart === 0 || now >= l.periodStart + a.periodMs;
  const spent = windowOver ? 0 : l.spent;
  return { perTx: l.perTx, perPeriod: l.perPeriod, spent, remaining: l.perPeriod - spent, resetsAt: windowOver ? null : l.periodStart + a.periodMs };
}

/** Mirror of agentSpend(): throws a ModelError carrying the contract's custom-error name. */
export function agentSpend(s: Snapshot, now: number, asset: string, to: string, amount: number): void {
  if (s.released || s.closed) throw new ModelError("Finished");
  const a = s.agent;
  if (!a) throw new ModelError("NotAgent");
  if (isFrozen(agentState(s, now))) throw new ModelError("AgentIsFrozen");
  const l = a.limits.find((x) => x.asset === asset);
  if (!l) throw new ModelError("AssetNotAllowed");
  if (!a.recipients.includes(to)) throw new ModelError("RecipientNotAllowed");
  if (!(amount > 0) || amount > l.perTx) throw new ModelError("OverPerTxLimit");
  let { periodStart, spent } = l;
  if (periodStart === 0 || now >= periodStart + a.periodMs) { periodStart = now; spent = 0; }
  if (spent + amount > l.perPeriod + 1e-9) throw new ModelError("OverPeriodLimit");
  l.periodStart = periodStart;
  l.spent = spent + amount;
}

const REASON: Record<string, BlockReason> = {
  AgentIsFrozen: "frozen", OverPerTxLimit: "over_per_tx", OverPeriodLimit: "over_period",
  RecipientNotAllowed: "recipient_not_allowed", AssetNotAllowed: "asset_not_allowed",
};
export const blockReasonOf = (e: unknown): BlockReason | null => (e instanceof ModelError ? REASON[e.message] ?? null : null);

/** Any single guardian, only once the owner is late (past the check-in deadline). */
export function guardianFreezeAgent(s: Snapshot, now: number): void {
  if (s.released || s.closed) throw new ModelError("Finished");
  if (!s.agent) throw new ModelError("NoAgent");
  if (now <= expiry(s)) throw new ModelError("NotYetExpired");
  if (s.agent.guardianFrozenEpoch === s.epoch) throw new ModelError("NothingToDo");
  s.agent.guardianFrozenEpoch = s.epoch;
}

/** Owner kill-switch (an owner action = proof of life; survives later check-ins). */
export function ownerFreezeAgent(s: Snapshot, now: number): void {
  if (!s.agent) throw new ModelError("NoAgent");
  if (s.agent.ownerFrozen) throw new ModelError("NothingToDo");
  s.agent.ownerFrozen = true;
  checkIn(s, now);
}

export function ownerUnfreezeAgent(s: Snapshot, now: number): void {
  if (!s.agent?.ownerFrozen) throw new ModelError("NothingToDo");
  s.agent.ownerFrozen = false;
  checkIn(s, now);
}

export function newSnapshot(
  now: number,
  o: Partial<Pick<Snapshot, "intervalMs" | "graceMs" | "challengeMs" | "fallbackMs" | "threshold" | "guardianCount" | "agent" | "successorName">> = {},
): Snapshot {
  return {
    agent: o.agent,
    successorName: o.successorName,
    intervalMs: o.intervalMs ?? 30 * DAY,
    graceMs: o.graceMs ?? 7 * DAY,
    challengeMs: o.challengeMs ?? 3 * DAY,
    fallbackMs: o.fallbackMs ?? 30 * DAY,
    lastCheckIn: now,
    pausedUntil: 0,
    epoch: 1,
    threshold: o.threshold ?? 2,
    guardianCount: o.guardianCount ?? 3,
    approvedBy: [],
    challengeEnd: null,
    released: false,
    closed: false,
  };
}

export function humanDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / HOUR);
  const m = Math.floor((ms % HOUR) / MIN);
  if (d >= 2) return h >= 1 && d < 10 ? `${d} days ${h} h` : `${d} days`;
  if (d === 1) return h ? `1 day ${h} h` : "1 day";
  if (h >= 1) return m && h < 10 ? `${h} h ${m} min` : `${h} h`;
  return `${Math.max(m, 0)} min`;
}
