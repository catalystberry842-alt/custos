import { describe, expect, it } from "vitest";
import { DAY, HOUR, graceEnd, expiry, newSnapshot } from "../src/chainModel.js";
import { decide } from "../src/engine.js";
import { profile, T0 } from "./helpers.js";

const snap = () => newSnapshot(T0, { guardianCount: 3, threshold: 2 });
const stages = (now: number, s = snap(), sent = new Set<string>()) =>
  decide(profile(), s, now, sent).send.map((a) => `${a.audience}:${a.stage}:${a.key.split(":")[3]}`);

describe("engine.decide (deterministic schedule)", () => {
  it("sends nothing right after check-in", () => {
    expect(stages(T0 + 1 * HOUR)).toEqual([]);
  });

  it("nudge exactly 7 days before expiry, reminder 1 day before", () => {
    const s = snap();
    expect(stages(expiry(s) - 7 * DAY - 1, s)).toEqual([]);
    expect(stages(expiry(s) - 7 * DAY, s)).toEqual(["owner:nudge:0"]);
    expect(stages(expiry(s) - 1 * DAY, s)).toEqual(["owner:reminder:0"]); // supersedes nudge
    expect(decide(profile(), s, expiry(s) - 1 * DAY, new Set()).skip).toEqual(["1:owner:nudge:0"]);
  });

  it("escalates through overdue steps during grace, guardians heads-up at half grace", () => {
    const s = snap();
    expect(stages(expiry(s) + 1, s)).toEqual(["owner:overdue:0"]);
    const sent = new Set(["1:owner:overdue:0", "1:owner:nudge:0", "1:owner:reminder:0"]);
    expect(stages(expiry(s) + s.graceMs / 4, s, sent)).toEqual(["owner:overdue:1"]);
    expect(stages(expiry(s) + s.graceMs / 2, s, new Set([...sent, "1:owner:overdue:1"]))).toEqual([
      "owner:overdue:2", "guardians:guardian_heads_up:0",
    ]);
  });

  it("final warning + guardian vote-open exactly after grace ends", () => {
    const s = snap();
    const sent = new Set(["1:owner:nudge:0", "1:owner:reminder:0", "1:owner:overdue:0", "1:owner:overdue:1", "1:owner:overdue:2", "1:owner:overdue:3", "1:guardians:guardian_heads_up:0"]);
    expect(stages(graceEnd(s), s, sent)).toEqual([]);
    expect(stages(graceEnd(s) + 1, s, sent)).toEqual(["owner:final_warning:0", "guardians:guardian_vote_open:0"]);
  });

  it("is idempotent: already-sent keys are never re-emitted", () => {
    const s = snap();
    const first = decide(profile(), s, expiry(s) + 1, new Set());
    const sent = new Set([...first.send.map((a) => a.key), ...first.skip]);
    expect(decide(profile(), s, expiry(s) + 1, sent).send).toEqual([]);
  });

  it("after downtime, sends only the latest step per audience (no spam)", () => {
    const s = snap();
    const plan = decide(profile(), s, graceEnd(s) + 2 * DAY, new Set());
    expect(plan.send.map((a) => `${a.audience}:${a.stage}`)).toEqual(["owner:final_warning", "guardians:guardian_vote_open"]);
    expect(plan.skip.length).toBeGreaterThan(3);
  });

  it("challenge: owner + guardians alerted; urgent tone for owner", () => {
    const s = snap();
    s.approvedBy = ["bola", "chidi"];
    s.challengeEnd = graceEnd(s) + 5 * HOUR + s.challengeMs;
    const now = graceEnd(s) + 6 * HOUR;
    const plan = decide(profile(), s, now, new Set());
    const owner = plan.send.find((a) => a.audience === "owner")!;
    expect(owner.stage).toBe("challenge_started");
    expect(owner.tone).toBe("urgent");
    expect(plan.send.find((a) => a.audience === "guardians")!.stage).toBe("challenge_started");
  });

  it("paused and closed vaults produce no messages", () => {
    const s = snap();
    s.pausedUntil = T0 + 60 * DAY;
    expect(stages(T0 + 40 * DAY, s)).toEqual([]);
    const c = snap();
    c.closed = true;
    expect(stages(T0 + 90 * DAY, c)).toEqual([]);
  });

  it("released: owner, guardians and beneficiary each informed once", () => {
    const s = snap();
    s.released = true;
    const plan = decide(profile(), s, T0 + 100 * DAY, new Set());
    expect(plan.send.map((a) => a.audience).sort()).toEqual(["beneficiary", "guardians", "owner"]);
  });

  it("same inputs → identical plan (pure function)", () => {
    const s = snap();
    const a = decide(profile(), s, expiry(s) + 3 * DAY, new Set());
    const b = decide(profile(), s, expiry(s) + 3 * DAY, new Set());
    expect(a).toEqual(b);
  });

  it("facts never contain unknown claims: numbers match the snapshot", () => {
    const s = snap();
    const a = decide(profile(), s, graceEnd(s) + 1, new Set()).send.find((x) => x.audience === "guardians")!;
    expect(a.facts.approvalsNeed).toBe(2);
    expect(a.facts.guardianTotal).toBe(3);
    expect(a.facts.interval).toBe("30 days");
  });
});
