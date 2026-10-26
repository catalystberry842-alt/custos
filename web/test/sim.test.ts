import { describe, expect, it } from "vitest";
import { DEFAULT_CFG, advanceBy, advanceTo, executeRelease, guardianApprove, initSim, nextSuggestion, ownerCheckIn, statusOf, DAY, HOUR } from "../lib/sim";
import { expiry, graceEnd } from "../lib/agent/chainModel";

const T0 = Date.UTC(2026, 10, 1, 9);

describe("demo simulation (same state machine as the contract)", () => {
  it("starts active and stays quiet for a healthy owner", () => {
    const s = advanceBy(initSim(DEFAULT_CFG, T0), 20 * DAY);
    expect(statusOf(s)).toBe("active");
    expect(s.feed.filter((f) => f.kind === "agent").length).toBe(0);
  });

  it("guardian collusion before expiry is rejected (revert shown in the feed)", () => {
    let s = advanceBy(initSim(DEFAULT_CFG, T0), 31 * DAY); // in grace
    expect(statusOf(s)).toBe("grace");
    s = guardianApprove(s, "g1");
    s = guardianApprove(s, "g2");
    expect(s.snap.approvedBy).toEqual([]);
    expect(s.feed.some((f) => f.title.startsWith("Revert"))).toBe(true);
    expect(statusOf(s)).toBe("grace");
  });

  it("double vote rejected", () => {
    let s = advanceTo(initSim(DEFAULT_CFG, T0), graceEnd(initSim(DEFAULT_CFG, T0).snap) + HOUR);
    s = guardianApprove(s, "g1");
    s = guardianApprove(s, "g1");
    expect(s.snap.approvedBy).toEqual(["g1"]);
  });

  it("full story: silent → alerts → vote → challenge → release", () => {
    let s = initSim(DEFAULT_CFG, T0);
    const seen: string[] = [];
    for (let i = 0; i < 12 && statusOf(s) !== "released"; i++) {
      seen.push(statusOf(s));
      s = nextSuggestion(s).run(s);
    }
    expect(seen).toEqual(["active", "grace", "awaiting_guardians", "challenge", "executable"]);
    expect(statusOf(s)).toBe("released");
    expect(s.feed.filter((f) => f.kind === "agent").some((f) => f.title.includes("Emeka"))).toBe(true);
    expect(s.feed.some((f) => f.title === "Released")).toBe(true);
  });

  it("owner returns during challenge: cancelled, all-clear sent, can't be released", () => {
    let s = initSim(DEFAULT_CFG, T0);
    for (let i = 0; i < 3; i++) s = nextSuggestion(s).run(s);
    expect(statusOf(s)).toBe("challenge");
    s = ownerCheckIn(s);
    expect(statusOf(s)).toBe("active");
    expect(s.snap.approvedBy).toEqual([]);
    expect(s.feed.some((f) => f.title === "ReleaseCancelled")).toBe(true);
    expect(s.feed.some((f) => f.kind === "agent" && f.body?.includes("alarm is cancelled"))).toBe(true);
    s = executeRelease(s);
    expect(s.snap.released).toBe(false);
  });

  it("is deterministic and JSON-serialisable (localStorage safe)", () => {
    const a = advanceBy(initSim(DEFAULT_CFG, T0), 35 * DAY);
    const b = advanceBy(JSON.parse(JSON.stringify(initSim(DEFAULT_CFG, T0))), 35 * DAY);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(expiry(a.snap)).toBe(T0 + 30 * DAY);
  });
});
