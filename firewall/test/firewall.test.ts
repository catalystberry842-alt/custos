import { describe, expect, it } from "vitest";
import {
  ADDR, AuditLog, CHAIN_ID, DEMO_AGENT, EthCallSimulator, Firewall, MockSimulator, SCENARIOS, ThreatChecker, T0, UNLIMITED, MAX_UINT256,
  canonical, decode, demoFirewall, demoIntel, demoPolicy, demoWorld, encodeApprove, encodePermit, encodeSetApprovalForAll,
  encodeTransfer, encodeTransferFrom, evaluatePolicy, makeClock, newRuntime, runScenario, sha256Hex, usdc, verifyChain, KNOWN_SELECTORS,
  type AgentPolicy, type RawAction,
} from "../src/index.js";

const mk = (over: Partial<RawAction> & { to: string }, c = { n: 0 }): RawAction => ({ agentId: "atlas", nonce: ++c.n, ts: T0 + 60_000, chainId: CHAIN_ID, ...over });
let N = 100;
const pay = (to: string, amt: number, over: Partial<RawAction> = {}) => mk({ to: ADDR.usdc, data: encodeTransfer(to, usdc(amt)), nonce: ++N, ...over });
const rule = (d: { rules: { rule: string; ok: boolean }[] }, r: string) => d.rules.find((x) => x.rule === r)!;

describe("sha256 + canonical", () => {
  it("matches known vectors", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("a".repeat(1000))).toBe("41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3");
  });
  it("canonical json sorts keys and renders bigint", () => {
    expect(canonical({ b: 1n, a: [2, { d: 1, c: undefined }] })).toBe('{"a":[2,{"d":1}],"b":"1"}');
  });
});

describe("calldata decoding (the agent's own words are never trusted)", () => {
  it("decodes transfers, approvals, permit and plain sends", () => {
    const t = decode({ to: ADDR.usdc, data: encodeTransfer(ADDR.acme, 5_000_000n) });
    expect(t).toMatchObject({ kind: "erc20_transfer", recipient: ADDR.acme, amountRaw: 5_000_000n, asset: ADDR.usdc });
    expect(decode({ to: ADDR.usdc, data: encodeTransferFrom(ADDR.rent, ADDR.acme, 7n) })).toMatchObject({ kind: "erc20_transferFrom", recipient: ADDR.acme });
    expect(decode({ to: ADDR.usdc, data: encodeApprove(ADDR.router, 10n) })).toMatchObject({ kind: "approve", unlimited: false, spender: ADDR.router });
    expect(decode({ to: ADDR.usdc, data: encodeApprove(ADDR.router, MAX_UINT256) }).unlimited).toBe(true);
    expect(decode({ to: ADDR.usdc, data: encodeApprove(ADDR.router, UNLIMITED) }).unlimited).toBe(true);
    expect(decode({ to: ADDR.usdc, data: encodeApprove(ADDR.router, UNLIMITED - 1n) }).unlimited).toBe(false);
    expect(decode({ to: ADDR.usdc, data: encodeSetApprovalForAll(ADDR.attacker, true) }).unlimited).toBe(true);
    expect(decode({ to: ADDR.usdc, data: encodeSetApprovalForAll(ADDR.attacker, false) }).unlimited).toBe(false);
    expect(decode({ to: ADDR.usdc, data: encodePermit(ADDR.rent, ADDR.attacker, MAX_UINT256, 1n) })).toMatchObject({ kind: "permit", spender: ADDR.attacker, unlimited: true });
    expect(decode({ to: ADDR.acme, value: 5n })).toMatchObject({ kind: "native_transfer", recipient: ADDR.acme, amountRaw: 5n });
  });
  it("treats malformed and unknown calldata as an unknown contract call", () => {
    expect(decode({ to: ADDR.usdc, data: "0xa9059cbb1234" })).toMatchObject({ kind: "contract_call", fn: "malformed(0xa9059cbb)" });
    expect(decode({ to: ADDR.usdc, data: "0xdeadbeef" }).fn).toBe("unknown(0xdeadbeef)");
    expect(decode({ to: ADDR.usdc, data: "0xdeadbeef" }, { "0xdeadbeef": "foo" }).fn).toBe("foo");
  });
  it("is case-insensitive on addresses", () => {
    expect(decode({ to: ADDR.usdc.toUpperCase().replace("0X", "0x") }).target).toBe(ADDR.usdc);
  });
});

describe("rules", () => {
  it("approves a normal allowlisted payment under every limit", async () => {
    const fw = demoFirewall();
    const d = await fw.submit(pay(ADDR.acme, 20));
    expect(d.verdict).toBe("approve");
    expect(d.rules.every((r) => r.ok)).toBe(true);
    expect(d.usd).toBeCloseTo(20);
  });
  it("blocks a recipient that is not on the allowlist", async () => {
    const d = await demoFirewall().submit(pay(ADDR.yieldVault, 5));
    expect(d.verdict).toBe("block");
    expect(rule(d, "destination").ok).toBe(false);
  });
  it("blocks an asset that is not allowlisted", async () => {
    const other = "0x1234567890123456789012345678901234567890";
    const d = await demoFirewall().submit(mk({ to: other, data: encodeTransfer(ADDR.acme, 5n), nonce: ++N }));
    expect(d.verdict).toBe("block");
    expect(rule(d, "asset").ok).toBe(false);
  });
  it("enforces the per-tx limit exactly", async () => {
    const fw = demoFirewall();
    const p = demoPolicy(); p.humanApprovalAboveUsd = undefined; fw.updatePolicy("atlas", p, T0);
    expect((await fw.submit(pay(ADDR.acme, 100))).verdict).toBe("approve");
    expect((await fw.submit(pay(ADDR.acme, 100.01))).verdict).toBe("block");
  });
  it("enforces the rolling daily limit and lets it roll off", async () => {
    const fw = demoFirewall();
    const p = demoPolicy(); p.humanApprovalAboveUsd = undefined; p.quota = { maxTx: 99, windowMs: 60_000 }; fw.updatePolicy("atlas", p, T0);
    expect((await fw.submit(pay(ADDR.acme, 100, { ts: T0 + 1000 }))).verdict).toBe("approve");
    expect((await fw.submit(pay(ADDR.acme, 100, { ts: T0 + 2000 }))).verdict).toBe("approve");
    const d = await fw.submit(pay(ADDR.acme, 60, { ts: T0 + 3000 }));
    expect(d.verdict).toBe("block");
    expect(rule(d, "daily").ok).toBe(false);
    expect((await fw.submit(pay(ADDR.acme, 60, { ts: T0 + 25 * 3_600_000 }))).verdict).toBe("approve");
  });
  it("enforces the lifetime cap", async () => {
    const fw = demoFirewall();
    const p: AgentPolicy = { ...demoPolicy(), humanApprovalAboveUsd: undefined, cumulativeUsd: 150, dailyUsd: 1e6, quota: { maxTx: 99, windowMs: 1 } };
    fw.updatePolicy("atlas", p, T0);
    expect((await fw.submit(pay(ADDR.acme, 100, { ts: T0 + 1000 }))).verdict).toBe("approve");
    const d = await fw.submit(pay(ADDR.acme, 60, { ts: T0 + 2 * 86_400_000 }));
    expect(rule(d, "cumulative").ok).toBe(false);
  });
  it("enforces the transaction quota", async () => {
    const fw = demoFirewall();
    const v: string[] = [];
    for (let i = 0; i < 8; i++) v.push((await fw.submit(pay(ADDR.acme, 1 + i / 10, { ts: T0 + 1000 * (i + 1) }))).verdict);
    expect(v.slice(0, 6)).toEqual(Array(6).fill("approve"));
    expect(v[6]).toBe("block");
  });
  it("sends amounts above the human threshold to a human", async () => {
    const d = await demoFirewall().submit(pay(ADDR.acme, 75));
    expect(d.verdict).toBe("pending");
    expect(d.pendingId).toBe(1);
    expect(rule(d, "human_threshold").ok).toBe(false);
  });
  it("blocks unlimited approve, permit and setApprovalForAll; bounded approval to an allowed spender passes", async () => {
    const fw = demoFirewall();
    const un = await fw.submit(mk({ to: ADDR.usdc, data: encodeApprove(ADDR.router, MAX_UINT256), nonce: ++N }));
    expect(un.verdict).toBe("block");
    expect(rule(un, "approvals").ok).toBe(false);
    expect((await fw.submit(mk({ to: ADDR.usdc, data: encodePermit(ADDR.rent, ADDR.router, 5n, 1n), nonce: ++N }))).verdict).toBe("block");
    expect((await fw.submit(mk({ to: ADDR.usdc, data: encodeSetApprovalForAll(ADDR.router, true), nonce: ++N }))).verdict).toBe("block");
    const ok = await fw.submit(mk({ to: ADDR.usdc, data: encodeApprove(ADDR.router, usdc(40)), nonce: ++N }));
    expect(ok.verdict).toBe("approve");
  });
  it("sends a bounded approval to an unlisted spender to a human", async () => {
    const d = await demoFirewall().submit(mk({ to: ADDR.usdc, data: encodeApprove(ADDR.rent, usdc(10)), nonce: ++N }));
    expect(d.verdict).toBe("pending");
  });
  it("an approval is exposure: it is limited by per-tx but does not count as a spend", async () => {
    const fw = demoFirewall();
    expect((await fw.submit(mk({ to: ADDR.usdc, data: encodeApprove(ADDR.router, usdc(500)), nonce: ++N }))).verdict).toBe("block");
    await fw.submit(mk({ to: ADDR.usdc, data: encodeApprove(ADDR.router, usdc(40)), nonce: ++N }));
    expect(fw.agents.get("atlas")!.runtime.cumulativeUsd).toBe(0);
  });
  it("unknown contract = human approval (or block when the policy says so)", async () => {
    const act = (n: number) => mk({ to: ADDR.yieldVault, data: "0xd0e30db0", nonce: n, value: 10n ** 16n });
    const fw = demoFirewall();
    expect((await fw.submit(act(++N))).verdict).toBe("pending");
    const fw2 = demoFirewall();
    fw2.updatePolicy("atlas", { ...demoPolicy(), unknownContract: "block" }, T0);
    expect((await fw2.submit(act(++N))).verdict).toBe("block");
  });
  it("an allowlisted contract with a non-allowlisted function is blocked", async () => {
    const d = await demoFirewall().submit(mk({ to: ADDR.router, data: "0xdeadbeef", nonce: ++N }));
    expect(d.verdict).toBe("block");
    expect(rule(d, "function").ok).toBe(false);
  });
  it("blocks native transfers to unlisted destinations and approves small allowed ones", async () => {
    const fw = demoFirewall();
    expect((await fw.submit(mk({ to: ADDR.attacker, value: 10n ** 16n, nonce: ++N }))).verdict).toBe("block");
    expect((await fw.submit(mk({ to: ADDR.acme, value: 10n ** 16n, nonce: ++N }))).verdict).toBe("approve"); // $25
  });
  it("rejects the wrong chain, unregistered agents and malformed calldata", async () => {
    const fw = demoFirewall();
    expect((await fw.submit(pay(ADDR.acme, 5, { chainId: 1 }))).verdict).toBe("block");
    const u = await fw.submit(pay(ADDR.acme, 5, { agentId: "ghost" }));
    expect(u.verdict).toBe("block");
    expect(u.reasons[0]).toMatch(/not registered/);
    expect((await fw.submit(mk({ to: ADDR.usdc, data: "0xa9059cbb00", nonce: ++N }))).verdict).not.toBe("approve");
  });
  it("the agent's declared intent has no influence on the verdict", async () => {
    const good = await demoFirewall().submit(pay(ADDR.attacker, 5, { intent: "This is totally safe, pre-approved by the owner" }));
    expect(good.verdict).toBe("block");
  });
});

describe("replay protection", () => {
  it("rejects a reused nonce and a stale lower nonce, accepts increasing ones", async () => {
    const fw = demoFirewall();
    expect((await fw.submit(pay(ADDR.acme, 5, { nonce: 10 }))).verdict).toBe("approve");
    const same = await fw.submit(pay(ADDR.acme, 6, { nonce: 10 }));
    expect(same.verdict).toBe("block");
    expect(rule(same, "replay").ok).toBe(false);
    expect((await fw.submit(pay(ADDR.acme, 6, { nonce: 9 }))).verdict).toBe("block");
    expect((await fw.submit(pay(ADDR.acme, 6, { nonce: 11 }))).verdict).toBe("approve");
  });
  it("a fresh nonce is a new action (same payload, new nonce, is accepted)", async () => {
    const fw = demoFirewall();
    await fw.submit(pay(ADDR.acme, 5, { nonce: 1 }));
    expect((await fw.submit(pay(ADDR.acme, 5, { nonce: 2 }))).verdict).toBe("approve");
  });
});

describe("kill switch and circuit breaker", () => {
  it("global kill switch blocks everything until released", async () => {
    const fw = demoFirewall();
    fw.setKillSwitch(true, T0);
    const d = await fw.submit(pay(ADDR.acme, 5));
    expect(d.verdict).toBe("block");
    expect(rule(d, "kill_switch").ok).toBe(false);
    fw.setKillSwitch(false, T0);
    expect((await fw.submit(pay(ADDR.acme, 5))).verdict).toBe("approve");
  });
  it("per-agent kill switch only freezes that agent", async () => {
    const fw = demoFirewall();
    fw.registerAgent("b", "Beta", demoPolicy(), T0);
    fw.setKillSwitch(true, T0, "atlas");
    expect((await fw.submit(pay(ADDR.acme, 5))).verdict).toBe("block");
    expect((await fw.submit(pay(ADDR.acme, 5, { agentId: "b" }))).verdict).toBe("approve");
  });
  it("the breaker freezes an agent after repeated blocks and records it", async () => {
    const fw = demoFirewall();
    for (let i = 0; i < 5; i++) await fw.submit(pay(ADDR.attacker, 5, { ts: T0 + 1000 * (i + 1) }));
    expect(fw.agents.get("atlas")!.runtime.frozen).toBe(true);
    const d = await fw.submit(pay(ADDR.acme, 5, { ts: T0 + 9000 }));
    expect(d.verdict).toBe("block");
    expect(rule(d, "kill_switch").ok).toBe(false);
    expect(fw.audit.entries.some((e) => e.type === "control" && /Circuit breaker/.test(e.summary))).toBe(true);
    fw.setKillSwitch(false, T0 + 10_000, "atlas");
    expect((await fw.submit(pay(ADDR.acme, 5, { ts: T0 + 11_000 }))).verdict).toBe("approve");
  });
  it("a kill-switch block does not feed the breaker", async () => {
    const fw = demoFirewall();
    fw.setKillSwitch(true, T0);
    for (let i = 0; i < 8; i++) await fw.submit(pay(ADDR.acme, 5));
    expect(fw.agents.get("atlas")!.runtime.blockedTs.length).toBe(0);
  });
});

describe("pending approvals", () => {
  it("a human can approve, and it then counts toward limits", async () => {
    const fw = demoFirewall();
    const d = await fw.submit(pay(ADDR.acme, 75));
    const r = await fw.resolvePending(d.pendingId!, "approve", "owner", T0 + 120_000);
    expect(r.verdict).toBe("approve");
    expect(fw.agents.get("atlas")!.runtime.cumulativeUsd).toBeCloseTo(75);
    expect(fw.pending[0]!.status).toBe("approved");
    await expect(fw.resolvePending(d.pendingId!, "approve", "owner", T0)).rejects.toThrow();
  });
  it("a human can deny", async () => {
    const fw = demoFirewall();
    const d = await fw.submit(pay(ADDR.acme, 75));
    const r = await fw.resolvePending(d.pendingId!, "deny", "owner", T0 + 1);
    expect(r.verdict).toBe("block");
    expect(fw.pending[0]!.status).toBe("denied");
  });
  it("human approval cannot override a hard rule, e.g. a kill switch pulled after the request", async () => {
    const fw = demoFirewall();
    const d = await fw.submit(pay(ADDR.acme, 75));
    fw.setKillSwitch(true, T0 + 5);
    const r = await fw.resolvePending(d.pendingId!, "approve", "owner", T0 + 10);
    expect(r.verdict).toBe("block");
    expect(fw.pending[0]!.status).toBe("denied");
  });
  it("approving an unknown-contract call still enforces a simulation that finds a drain", async () => {
    const fw = demoFirewall();
    fw.updatePolicy("atlas", { ...demoPolicy(), contracts: [], unknownContract: "pending" }, T0);
    const d = await fw.submit(mk({ to: ADDR.drainer, data: "0x4e71d92d", nonce: ++N }));
    expect(d.verdict).toBe("block"); // simulation catches it first
  });
});

describe("simulation", () => {
  it("catches a call that moves more than it declares", async () => {
    const d = await demoFirewall().submit(mk({ to: ADDR.drainer, data: "0x4e71d92d", nonce: ++N }));
    expect(d.verdict).toBe("block");
    expect(rule(d, "simulation").ok).toBe(false);
    expect(d.reasons.join(" ")).toMatch(/does more than it says/);
  });
  it("catches a transfer that would revert for lack of balance", async () => {
    const fw = demoFirewall();
    fw.updatePolicy("atlas", { ...demoPolicy(), perTxUsd: 1e9, dailyUsd: 1e9, cumulativeUsd: 1e9, humanApprovalAboveUsd: undefined }, T0);
    const d = await fw.submit(pay(ADDR.acme, 99_999));
    expect(d.verdict).toBe("block");
    expect(d.reasons.join(" ")).toMatch(/insufficient balance/);
  });
  it("catches a reverting contract", async () => {
    const fw = demoFirewall();
    fw.updatePolicy("atlas", { ...demoPolicy(), contracts: [ADDR.broken], functions: ["swapExactTokensForTokens"] }, T0);
    const d = await fw.submit(mk({ to: ADDR.broken, data: "0x38ed1739", nonce: ++N }));
    expect(d.verdict).toBe("block");
    expect(d.reasons.join(" ")).toMatch(/reverts/);
  });
  it("EthCallSimulator reports reverts from an injected rpc and passes clean calls", async () => {
    const calls: string[] = [];
    const sim = new EthCallSimulator(async (m) => { calls.push(m); return "0x"; }, ADDR.rent);
    const a = pay(ADDR.acme, 5);
    const ok = await sim.simulate({ action: a, decoded: decode(a) });
    expect(ok.ok).toBe(true);
    expect(calls).toEqual(["eth_call", "eth_estimateGas"]);
    const bad = new EthCallSimulator(async () => { throw new Error("execution reverted: ERC20: transfer amount exceeds balance"); }, ADDR.rent);
    const r = await bad.simulate({ action: a, decoded: decode(a) });
    expect(r.ok).toBe(false);
    expect(r.revertReason).toMatch(/exceeds balance/);
  });
  it("the simulator is pluggable into the firewall", async () => {
    const fw = new Firewall({ simulator: new EthCallSimulator(async () => { throw new Error("execution reverted"); }, ADDR.rent), threat: new ThreatChecker(demoIntel()) });
    fw.registerAgent("atlas", "Atlas", demoPolicy(), T0);
    const d = await fw.submit(pay(ADDR.acme, 5));
    expect(d.verdict).toBe("block");
  });
});

describe("threat checker", () => {
  const t = new ThreatChecker(demoIntel());
  it("flags known-bad addresses", () => {
    const f = t.check(decode({ to: ADDR.usdc, data: encodeTransfer(ADDR.attacker, 1n) }), demoPolicy());
    expect(f.map((x) => x.code)).toContain("known_bad");
  });
  it("flags address-poisoning lookalikes of an allowlisted payee", () => {
    const f = t.check(decode({ to: ADDR.usdc, data: encodeTransfer(ADDR.lookalike, 1n) }), demoPolicy());
    expect(f.map((x) => x.code)).toContain("lookalike");
  });
  it("does not flag the real payee as a lookalike", () => {
    expect(t.check(decode({ to: ADDR.usdc, data: encodeTransfer(ADDR.acme, 1n) }), demoPolicy())).toEqual([]);
  });
  it("flags unlimited approvals and unverified contracts", () => {
    expect(t.check(decode({ to: ADDR.usdc, data: encodeApprove(ADDR.router, MAX_UINT256) }), demoPolicy()).map((x) => x.code)).toContain("unlimited_approval");
    expect(t.check(decode({ to: ADDR.yieldVault, data: "0xd0e30db0" }), demoPolicy()).map((x) => x.code)).toContain("unverified_contract");
    expect(t.check(decode({ to: ADDR.router, data: "0xdeadbeef" }), demoPolicy()).map((x) => x.code)).not.toContain("unverified_contract");
  });
  it("blocks a lookalike payment end to end", async () => {
    const d = await demoFirewall().submit(pay(ADDR.lookalike, 5));
    expect(d.verdict).toBe("block");
    expect(rule(d, "threat").ok).toBe(false);
  });
});

describe("attack scenarios (default demo policy)", () => {
  for (const s of SCENARIOS) {
    it(`${s.id}: ${s.title}`, async () => {
      const fw = demoFirewall();
      const res = await runScenario(fw, s, makeClock());
      expect(res.map((r) => r.decision.verdict)).toEqual(s.expect);
      const failing = new Set(res.flatMap((r) => r.decision.rules.filter((x) => !x.ok).map((x) => x.rule)));
      expect(s.because.some((b) => failing.has(b))).toBe(true);
      expect(fw.audit.verify().ok).toBe(true);
      // nothing blocked ever reached "approve"
      const approvedUsd = fw.agents.get("atlas")!.runtime.cumulativeUsd;
      expect(approvedUsd).toBeLessThan(120);
    });
  }
  it("the runaway loop ends with the agent frozen", async () => {
    const fw = demoFirewall();
    await runScenario(fw, SCENARIOS.find((s) => s.id === "runaway")!, makeClock());
    expect(fw.agents.get("atlas")!.runtime.frozen).toBe(true);
  });
});

describe("audit trail (Proof of Agent)", () => {
  async function filled() {
    const fw = demoFirewall();
    await fw.submit(pay(ADDR.acme, 20));
    const d = await fw.submit(pay(ADDR.attacker, 400));
    await fw.submit(pay(ADDR.acme, 75));
    fw.reportResult(0 + 1, { ok: true, detail: "x" }, T0);
    return { fw, d };
  }
  it("links entries and verifies", async () => {
    const { fw } = await filled();
    const e = fw.audit.entries;
    expect(e[0]!.prevHash).toBe("0".repeat(64));
    expect(e[1]!.prevHash).toBe(e[0]!.hash);
    expect(fw.audit.verify()).toMatchObject({ ok: true, checked: e.length });
  });
  it("records agent, action, rules passed and failed, decision and policy hash", async () => {
    const { fw, d } = await filled();
    const e = fw.audit.entries[d.auditIndex]!;
    expect(e).toMatchObject({ agentId: "atlas", agentName: "Atlas", decision: "block", type: "decision" });
    expect(e.action).toMatchObject({ fn: "transfer", recipient: ADDR.attacker });
    expect(e.rules!.some((r) => !r.ok)).toBe(true);
    expect(e.rules!.some((r) => r.ok)).toBe(true);
    expect(e.policyHash).toHaveLength(64);
  });
  it("detects an edited entry", async () => {
    const { fw } = await filled();
    const copy = JSON.parse(JSON.stringify(fw.audit.entries));
    copy[2].decision = "approve";
    const v = verifyChain(copy);
    expect(v.ok).toBe(false);
    expect(v.brokenAt).toBe(2);
    expect(v.reason).toMatch(/modified/);
  });
  it("detects a deleted and a reordered entry", async () => {
    const { fw } = await filled();
    const del = JSON.parse(JSON.stringify(fw.audit.entries)); del.splice(1, 1);
    expect(verifyChain(del).ok).toBe(false);
    const sw = JSON.parse(JSON.stringify(fw.audit.entries)); [sw[1], sw[2]] = [sw[2], sw[1]];
    expect(verifyChain(sw).ok).toBe(false);
  });
  it("detects an edited reason text", async () => {
    const { fw } = await filled();
    const copy = JSON.parse(JSON.stringify(fw.audit.entries));
    copy[1].reasons = ["nothing wrong"];
    expect(verifyChain(copy).brokenAt).toBe(1);
  });
  it("records policy changes, resolutions, controls and results", async () => {
    const { fw } = await filled();
    fw.updatePolicy("atlas", { ...demoPolicy(), perTxUsd: 50 }, T0 + 5);
    await fw.resolvePending(1, "deny", "owner", T0 + 6);
    fw.setKillSwitch(true, T0 + 7);
    const types = fw.audit.entries.map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(["register", "decision", "result", "policy", "resolution", "control"]));
    expect(fw.audit.verify().ok).toBe(true);
  });
  it("an empty log verifies", () => { expect(new AuditLog().verify()).toMatchObject({ ok: true, checked: 0 }); });
});

describe("persistence", () => {
  it("serialize/restore round-trips state, pending bigints and audit", async () => {
    const fw = demoFirewall();
    await fw.submit(pay(ADDR.acme, 20));
    await fw.submit(pay(ADDR.acme, 75));
    const json = fw.serialize();
    const back = Firewall.restore(json, { simulator: new MockSimulator(demoWorld()), threat: new ThreatChecker(demoIntel()), extraSelectors: KNOWN_SELECTORS });
    expect(back.audit.verify().ok).toBe(true);
    expect(back.audit.entries.length).toBe(fw.audit.entries.length);
    expect(back.pending[0]!.decoded.amountRaw).toBe(usdc(75));
    expect(back.agents.get("atlas")!.runtime.cumulativeUsd).toBeCloseTo(20);
    const r = await back.resolvePending(1, "approve", "owner", T0 + 200_000);
    expect(r.verdict).toBe("approve");
    expect((await back.submit(pay(ADDR.acme, 1, { nonce: 1 }))).verdict).toBe("block"); // replay state restored
  });
});

describe("evaluatePolicy is pure", () => {
  it("does not mutate runtime state", () => {
    const rt = newRuntime();
    const a = pay(ADDR.acme, 5);
    evaluatePolicy({ policy: demoPolicy(), rt, action: a, decoded: decode(a), findings: [], sim: { ok: true, balanceChanges: [], approvalsGranted: [], notes: [], simulator: "t" }, killAll: false, replay: { nonceOk: true, digestSeen: false } });
    expect(rt).toEqual(newRuntime());
  });
});
void DEMO_AGENT;
