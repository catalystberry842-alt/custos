import { describe, expect, it } from "vitest";
import { PLAIN_CFG, DEFAULT_CFG, advanceBy, advanceTo, agentPay, agentView, executeRelease, guardianApprove, guardianFreeze, initSim, nextSuggestion, ownerCheckIn, statusOf, DAY, HOUR } from "../lib/sim";
import { expiry, graceEnd } from "../lib/agent/chainModel";

const T0 = Date.UTC(2026, 10, 1, 9);

describe("demo simulation (same state machine as the contract)", () => {
  it("starts active and stays quiet for a healthy owner", () => {
    const s = advanceBy(initSim(PLAIN_CFG, T0), 20 * DAY);
    expect(statusOf(s)).toBe("active");
    expect(s.feed.filter((f) => f.kind === "agent").length).toBe(0);
  });

  it("guardian collusion before expiry is rejected (revert shown in the feed)", () => {
    let s = advanceBy(initSim(PLAIN_CFG, T0), 31 * DAY); // in grace
    expect(statusOf(s)).toBe("grace");
    s = guardianApprove(s, "g1");
    s = guardianApprove(s, "g2");
    expect(s.snap.approvedBy).toEqual([]);
    expect(s.feed.some((f) => f.title.startsWith("Revert"))).toBe(true);
    expect(statusOf(s)).toBe("grace");
  });

  it("double vote rejected", () => {
    let s = advanceTo(initSim(PLAIN_CFG, T0), graceEnd(initSim(PLAIN_CFG, T0).snap) + HOUR);
    s = guardianApprove(s, "g1");
    s = guardianApprove(s, "g1");
    expect(s.snap.approvedBy).toEqual(["g1"]);
  });

  it("full story: silent → alerts → vote → challenge → release", () => {
    let s = initSim(PLAIN_CFG, T0);
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
    let s = initSim(PLAIN_CFG, T0);
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
    const a = advanceBy(initSim(PLAIN_CFG, T0), 35 * DAY);
    const b = advanceBy(JSON.parse(JSON.stringify(initSim(PLAIN_CFG, T0))), 35 * DAY);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(expiry(a.snap)).toBe(T0 + 30 * DAY);
  });
});

describe("AI agent in the demo", () => {
  const agentOf = (s: ReturnType<typeof initSim>) => agentView(s)!;

  it("pays inside limits, blocks outside, and tells the owner in plain language", () => {
    let s = initSim(DEFAULT_CFG, T0);
    s = agentPay(s, "Acme Cloud", 30);
    expect(agentOf(s).remaining).toBe(170);
    s = agentPay(s, "Scam LLC", 10);
    s = agentPay(s, "Acme Cloud", 500);
    expect(agentOf(s).remaining).toBe(170); // blocked attempts never move money
    s = advanceBy(s, 2 * HOUR);
    const msgs = s.feed.filter((f) => f.kind === "agent").map((f) => f.body ?? "");
    expect(msgs.some((m) => /paid \$30/.test(m))).toBe(true);
    expect(msgs.some((m) => /stopped/.test(m))).toBe(true);
    expect(s.feed.filter((f) => f.title.startsWith("Revert")).length).toBe(2);
  });

  it("owner silent → agent frozen after grace; spending reverts; owner returning unfreezes", () => {
    let s = advanceTo(initSim(DEFAULT_CFG, T0), expiry(initSim(DEFAULT_CFG, T0).snap) + 2 * DAY);
    expect(agentOf(s).state).toBe("active"); // still inside the grace period
    s = advanceTo(s, graceEnd(s.snap) + HOUR);
    expect(agentOf(s).state).toBe("frozen_lapsed");
    const before = agentOf(s).remaining;
    s = agentPay(s, "Acme Cloud", 5);
    expect(agentOf(s).remaining).toBe(before);
    expect(s.events.at(-1)?.reason).toBe("frozen");
    s = advanceBy(s, 3 * HOUR);
    const bodies = s.feed.filter((f) => f.kind === "agent").map((f) => f.body ?? "");
    expect(bodies.some((t) => /frozen/.test(t) && /check/.test(t))).toBe(true);
    s = ownerCheckIn(s);
    expect(agentOf(s).state).toBe("active");
    expect(s.feed.some((f) => f.title.startsWith("AgentUnfrozen"))).toBe(true);
  });

  it("guardians hand over to the named successor; the agent loses its permissions", () => {
    let s = initSim(DEFAULT_CFG, T0);
    for (let i = 0; i < 12 && !s.snap.handover; i++) s = nextSuggestion(s).run(s);
    expect(s.snap.handover?.toName).toBe("Tunde");
    expect(s.snap.released).toBe(false);
    expect(agentView(s)).toBeNull();
    expect(s.feed.some((f) => f.kind === "agent" && f.title.includes("Tunde"))).toBe(true);
    expect(s.feed.some((f) => f.title === "HandedOver")).toBe(true);
  });

  it("shutdown outcome returns funds to the beneficiary and stops the agent", () => {
    let s = advanceTo(initSim(DEFAULT_CFG, T0), graceEnd(initSim(DEFAULT_CFG, T0).snap) + HOUR);
    s = guardianApprove(s, "g1", "release");
    s = guardianApprove(s, "g2", "release");
    s = advanceTo(s, s.snap.challengeEnd! + HOUR);
    s = executeRelease(s);
    expect(statusOf(s)).toBe("released");
    expect(agentOf(s).state).toBe("stopped");
  });

  it("split votes between outcomes do not reach the threshold", () => {
    let s = advanceTo(initSim(DEFAULT_CFG, T0), graceEnd(initSim(DEFAULT_CFG, T0).snap) + HOUR);
    s = guardianApprove(s, "g1", "release");
    s = guardianApprove(s, "g2", "handover");
    expect(s.snap.challengeEnd).toBeNull();
    s = guardianApprove(s, "g3", "handover");
    expect(s.snap.challengeEnd).not.toBeNull();
    expect(s.snap.pendingOutcome).toBe("handover");
  });

  it("a guardian can freeze only once the owner is late", () => {
    let s = initSim(DEFAULT_CFG, T0);
    s = guardianFreeze(s, "g1");
    expect(s.feed[0]!.title).toMatch(/Revert/);
    s = advanceTo(s, expiry(s.snap) + HOUR);
    s = guardianFreeze(s, "g1");
    expect(agentOf(s).state).toBe("frozen_guardian");
  });
});
