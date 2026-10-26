import { describe, expect, it, vi } from "vitest";
import { MockChannel } from "../src/channels.js";
import { status, DAY, HOUR, graceEnd } from "../src/chainModel.js";
import { createCheckInServer } from "../src/server.js";
import { ClaudeWording, ResilientWording } from "../src/wording.js";
import { setup } from "./helpers.js";
import type { AddressInfo } from "node:net";

describe("agent end-to-end (simulated clock + mock channels)", () => {
  it("healthy owner gets only nudge+reminder, guardians hear nothing", async () => {
    const t = setup();
    await t.advance(29 * DAY);
    expect(t.to("ada").length).toBe(2);
    expect(t.to("bola").length).toBe(0);
    expect(t.to("emeka").length).toBe(0);
  });

  it("silent owner: escalation → guardian alerts → challenge → release; each message once", async () => {
    const t = setup();
    await t.advance(40 * DAY - 6 * HOUR); // into awaiting_guardians
    const snap = await t.chain.read("s1");
    expect(status(snap, t.clock.now)).toBe("awaiting_guardians");
    const ownerStages = t.agent.log.filter((d) => d.audience === "owner").map((d) => d.stage);
    expect(ownerStages).toEqual(expect.arrayContaining(["nudge", "reminder", "overdue", "final_warning"]));
    const bolaStages = t.agent.log.filter((d) => d.contactId === "bola").map((d) => d.stage);
    expect(bolaStages).toEqual(["guardian_heads_up", "guardian_vote_open"]);

    t.chain.approve("s1", "bola", t.clock.now);
    t.chain.approve("s1", "chidi", t.clock.now);
    await t.advance(1 * DAY);
    expect(t.agent.log.some((d) => d.stage === "challenge_started" && d.contactId === "ada")).toBe(true);
    expect(t.to("emeka").length).toBe(0); // beneficiary is NOT pinged before release

    await t.advance(3 * DAY);
    t.chain.execute("s1", t.clock.now);
    await t.advance(2 * DAY);
    expect(t.to("emeka").length).toBe(1);
    expect(t.agent.log.filter((d) => d.stage === "released").map((d) => d.contactId).sort()).toEqual(["ada", "bola", "chidi", "dayo", "emeka"]);
    // no duplicates
    const keys = t.agent.log.map((d) => `${d.contactId}:${d.stage}:${d.text}`);
    const repeats = keys.filter((k, i) => keys.indexOf(k) !== i && !k.includes("overdue") && !k.includes("challenge_started"));
    expect(repeats).toEqual([]);
  });

  it("owner returns during challenge via chat: all-clear to owner and guardians, state cancelled", async () => {
    const t = setup();
    await t.advance(38 * DAY);
    t.chain.approve("s1", "bola", t.clock.now);
    t.chain.approve("s1", "chidi", t.clock.now);
    await t.advance(1 * DAY);
    const reply = await t.agent.handleInbound("mock", "ada", "I'm here");
    expect(reply).toMatch(/Checked in/);
    const snap = await t.chain.read("s1");
    expect(status(snap, t.clock.now)).toBe("active");
    expect(snap.challengeEnd).toBeNull();
    expect(t.agent.log.filter((d) => d.stage === "all_clear").map((d) => d.contactId).sort()).toEqual(["ada", "bola", "chidi", "dayo"]);
    expect(t.to("emeka").length).toBe(0);
    // and the new cycle starts clean
    await t.advance(5 * DAY);
    expect(t.agent.log.filter((d) => d.stage === "all_clear").length).toBe(4);
  });

  it("owner who only got a nudge does NOT trigger an all-clear (no pointless noise)", async () => {
    const t = setup();
    await t.advance(24 * DAY);
    await t.agent.handleInbound("mock", "ada", "/checkin");
    await t.advance(1 * DAY);
    expect(t.agent.log.some((d) => d.stage === "all_clear")).toBe(false);
  });

  it("failed delivery is retried on the next tick, not marked sent", async () => {
    const ch = new MockChannel("mock");
    const t = setup({ channel: ch });
    await t.advance(23 * DAY + 1 * HOUR);
    ch.setFailure("telegram down");
    await t.advance(2 * HOUR, HOUR); // reminder time passes while down? nudge is at day 23
    ch.setFailure(undefined);
    const before = t.to("ada").length;
    await t.advance(1 * HOUR);
    expect(t.to("ada").length).toBeGreaterThanOrEqual(before);
    expect(t.to("ada").length).toBeGreaterThan(0);
  });

  it("all channels down at the due time → delivered once recovered", async () => {
    const ch = new MockChannel("mock", "down");
    const t = setup({ channel: ch });
    await t.advance(24 * DAY);
    expect(t.to("ada").length).toBe(0);
    expect(t.agent.log.every((d) => !d.ok)).toBe(true);
    ch.setFailure(undefined);
    await t.advance(3 * HOUR);
    expect(t.to("ada").length).toBe(1);
  });

  it("works with Claude erroring (no credit): messages still go out with rules wording", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 402 }));
    const w = new ResilientWording(new ClaudeWording({ apiKey: "k", fetchImpl: fetchImpl as any }));
    const t = setup({ wording: w });
    await t.advance(32 * DAY);
    expect(t.to("ada").length).toBeGreaterThan(2);
    expect(t.agent.log.every((d) => d.source === "rules")).toBe(true);
  });

  it("messages always contain deterministic facts, even if the model is weird", async () => {
    const weird = { name: "weird", intro: async () => "Hello friend, nothing to see here." };
    const t = setup({ wording: weird });
    await t.advance(24 * DAY);
    const msg = t.to("ada")[0]!.msg.text;
    expect(msg).toContain("What happens next:");
    expect(msg).toContain("restarts your timer");
    expect(msg).toContain("https://checkin.test/c/s1.");
  });

  it("never asks for keys / seeds and never links off the pinned origin", async () => {
    const t = setup();
    await t.advance(40 * DAY);
    for (const { msg } of t.channel.sent) {
      expect(msg.text).not.toMatch(/seed phrase|private key|recovery phrase/i);
      for (const u of msg.text.match(/https?:\/\/[^\s]+/g) ?? []) expect(u).toMatch(/^https:\/\/(checkin|app)\.test/);
    }
  });

  it("unknown chat gets nothing; guardian cannot check in for the owner", async () => {
    const t = setup();
    expect(await t.agent.handleInbound("mock", "stranger", "/status")).toMatch(/don't recognise/);
    const r = await t.agent.handleInbound("mock", "bola", "/checkin");
    expect(r).toMatch(/didn't understand/);
    const snap = await t.chain.read("s1");
    expect(snap.epoch).toBe(1);
    expect(await t.agent.handleInbound("mock", "bola", "/approve")).toMatch(/on-chain from your own wallet/);
  });

  it("/pause validates range and stops reminders", async () => {
    const t = setup();
    expect(await t.agent.handleInbound("mock", "ada", "/pause 200")).toMatch(/Usage/);
    expect(await t.agent.handleInbound("mock", "ada", "/pause 30")).toMatch(/Vacation mode/);
    await t.advance(40 * DAY);
    expect(t.to("ada").length).toBe(0);
  });

  it("link tokens are epoch-bound: valid → check-in → same link dead", async () => {
    const t = setup();
    const token = t.agent.tokenFor("s1", 1);
    expect(await t.agent.verifyToken(token)).not.toBeNull();
    expect(await t.agent.verifyToken(token.slice(0, -2) + "xx")).toBeNull();
    expect(await t.agent.verifyToken("nope.abc")).toBeNull();
    t.clock.now += 5 * DAY;
    expect((await t.agent.checkInViaToken(token)).ok).toBe(true);
    expect((await t.agent.checkInViaToken(token)).ok).toBe(false);
    expect(graceEnd(await t.chain.read("s1"))).toBeGreaterThan(t.clock.now);
  });

  it("HTTP: GET never checks in (link-preview safe); POST does", async () => {
    const t = setup();
    const token = t.agent.tokenFor("s1", 1);
    const srv = createCheckInServer(t.agent);
    await new Promise<void>((r) => srv.listen(0, r));
    const port = (srv.address() as AddressInfo).port;
    try {
      const g = await fetch(`http://127.0.0.1:${port}/c/${token}`);
      expect(g.status).toBe(200);
      expect(await g.text()).toContain("I'm here");
      expect((await t.chain.read("s1")).epoch).toBe(1);
      const p = await fetch(`http://127.0.0.1:${port}/c/${token}`, { method: "POST" });
      expect(p.status).toBe(200);
      expect((await t.chain.read("s1")).epoch).toBe(2);
      const again = await fetch(`http://127.0.0.1:${port}/c/${token}`);
      expect(again.status).toBe(410);
      expect((await fetch(`http://127.0.0.1:${port}/nope`)).status).toBe(404);
    } finally {
      srv.close();
    }
  });
});
