import { describe, expect, it } from "vitest";
import { ADDR, SCENARIOS, demoPolicy, verifyChain } from "../lib/firewall";
import { agentOf, createDemo, loadDemo, pay, runScenarioDemo, saveDemo, setPolicy, submit } from "../lib/fwdemo";

describe("firewall demo (same engine as firewall/)", () => {
  it("every attack scenario ends as expected when run back to back on one live firewall", async () => {
    const d = createDemo();
    for (const s of SCENARIOS) {
      const run = await runScenarioDemo(d, s);
      expect(run.verdicts, s.id).toEqual(s.expect);
      expect(run.matched).toBe(true);
    }
    expect(d.fw.audit.verify().ok).toBe(true);
    expect(agentOf(d).runtime.cumulativeUsd).toBeLessThan(150); // only the legitimate payments moved
  });
  it("normal payments approve, large ones wait for a human, who can approve", async () => {
    const d = createDemo();
    expect((await submit(d, pay(d, ADDR.acme, 20, "Pay"))).verdict).toBe("approve");
    const big = await submit(d, pay(d, ADDR.acme, 75, "Pay"));
    expect(big.verdict).toBe("pending");
    expect((await d.fw.resolvePending(big.pendingId!, "approve", "owner", d.t + 1)).verdict).toBe("approve");
  });
  it("state survives a save/load round trip and a tampered save is rejected", async () => {
    const d = createDemo();
    await submit(d, pay(d, ADDR.acme, 20, "Pay"));
    await runScenarioDemo(d, SCENARIOS[0]!);
    const raw = saveDemo(d);
    const back = loadDemo(raw)!;
    expect(back.fw.audit.entries.length).toBe(d.fw.audit.entries.length);
    expect(back.runs.injection?.matched).toBe(true);
    const o = JSON.parse(raw); const fw = JSON.parse(o.fw); fw.audit[2].decision = "approve"; o.fw = JSON.stringify(fw);
    expect(loadDemo(JSON.stringify(o))).toBeNull();
    expect(loadDemo("not json")).toBeNull();
  });
  it("a policy change is audited and takes effect", async () => {
    const d = createDemo();
    setPolicy(d, { ...demoPolicy(), perTxUsd: 10, humanApprovalAboveUsd: undefined });
    expect((await submit(d, pay(d, ADDR.acme, 20, "Pay"))).verdict).toBe("block");
    expect(d.fw.audit.entries.some((e) => e.type === "policy")).toBe(true);
    expect(verifyChain(d.fw.audit.entries).ok).toBe(true);
  });
});
