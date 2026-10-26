/**
 * chainModel.ts — pure, dependency-free mirror of the Heirloom contract's state machine.
 *
 * Used by: the agent (SimChain + deciding what to say) and, via scripts/sync-model.sh, the web demo.
 * Keep semantically identical to contracts/src/Heirloom.sol (status(), anchor(), approve, touch).
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
  s.challengeEnd = null;
  return { cancelled };
}

export function pause(s: Snapshot, now: number, durationMs: number): void {
  if (durationMs <= 0 || durationMs > 90 * DAY) throw new ModelError("BadParams");
  if (s.released || s.closed) throw new ModelError("Finished");
  s.pausedUntil = now + durationMs;
  checkIn(s, now);
}

export function approve(s: Snapshot, now: number, guardianId: string): { challengeStarted: boolean } {
  if (s.released || s.closed) throw new ModelError("Finished");
  if (now <= graceEnd(s)) throw new ModelError("NotYetExpired");
  if (s.challengeEnd !== null) throw new ModelError("ChallengeRunning");
  if (s.approvedBy.includes(guardianId)) throw new ModelError("AlreadyApproved");
  s.approvedBy.push(guardianId);
  if (s.approvedBy.length >= s.threshold) {
    s.challengeEnd = now + s.challengeMs;
    return { challengeStarted: true };
  }
  return { challengeStarted: false };
}

export function execute(s: Snapshot, now: number): void {
  if (s.released || s.closed) throw new ModelError("Finished");
  if (s.challengeEnd === null) throw new ModelError("NotYetExpired");
  if (now < s.challengeEnd) throw new ModelError("ChallengeNotOver");
  s.released = true;
  s.challengeEnd = null;
}

export function newSnapshot(
  now: number,
  o: Partial<Pick<Snapshot, "intervalMs" | "graceMs" | "challengeMs" | "fallbackMs" | "threshold" | "guardianCount">> = {},
): Snapshot {
  return {
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
