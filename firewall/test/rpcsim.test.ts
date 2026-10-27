import { describe, expect, it } from "vitest";
import {
  ThreatChecker, EthSimulateV1Simulator, decideStateless, decode, encodeAgentSpend, encodeApprove, encodeTransfer, newRuntime, makeEntry, verifyChain,
  MAX_UINT256, NATIVE_TRANSFER_LOGGER, TOPICS, type AgentPolicy, type RawAction,
} from "../src/index.js";

const VAULT = "0x7cd7d6b00023b298eb869e3201af077dac71955c";
const AGENT = "0x78141a8f7c99ee9bbb3148096f4add6fed925888";
const ACME = "0xa93f5f5f3e3a1c9a5017298cd64a643ec16f717e";
const ZERO = "0x0000000000000000000000000000000000000000";
const T = (a: string) => "0x" + a.replace(/^0x/, "").padStart(64, "0");

const policy = (): AgentPolicy => ({
  chainId: 46630, unit: "ETH", assets: { native: { symbol: "ETH", decimals: 18, usd: 1 } }, contracts: [VAULT], functions: ["agentSpend"], recipients: [ACME], spenders: [],
  perTxUsd: 0.0005, dailyUsd: 0.002, cumulativeUsd: 1, quota: { maxTx: 5, windowMs: 3_600_000 }, humanApprovalAboveUsd: 0.0003, unknownContract: "pending",
});
const act = (data: string, to = VAULT, nonce = 0): RawAction => ({ agentId: "atlas", nonce, ts: 1_000_000, chainId: 46630, to, data });
// responses recorded from the real Robinhood testnet RPC (eth_simulateV1 with traceTransfers) against the demo vault
const OK = [{ calls: [{ status: "0x1", returnData: "0x", gasUsed: "0x21735", logs: [
  { address: VAULT, topics: ["0x350c27ac87ef019173063bef427ab72afff25e55aa1b294166ee9d06b5f1a029", T(AGENT), T(ZERO), T(ACME)], data: "0x00" },
  { address: NATIVE_TRANSFER_LOGGER, topics: [TOPICS.Transfer, T(VAULT), T(ACME)], data: "0x" + (200000000000000n).toString(16).padStart(64, "0") }] }] }];
const REVERT = (data: string) => [{ calls: [{ status: "0x0", returnData: "0x", logs: [], error: { message: "execution reverted", code: 3, data } }] }];
const sim = (r: unknown) => new EthSimulateV1Simulator(async (m) => { if (m !== "eth_simulateV1") throw new Error("bad method " + m); return r; }, AGENT, [VAULT]);
const threat = new ThreatChecker({ knownBad: {}, verified: { [VAULT]: true } });
const run = (data: string, r: unknown, over: Partial<Parameters<typeof decideStateless>[0]> = {}) =>
  decideStateless({ policy: policy(), rt: newRuntime(), action: act(data), simulator: sim(r), threat, nonceOk: true, ...over });

describe("agentSpend decoding", () => {
  it("decodes the vault call as a native transfer with the real recipient", () => {
    const d = decode(act(encodeAgentSpend(ZERO, ACME, 123n)));
    expect(d).toMatchObject({ kind: "native_transfer", fn: "agentSpend", target: VAULT, asset: "native", recipient: ACME, amountRaw: 123n });
    expect(decode(act(encodeAgentSpend("0x5fbdb2315678afecb367f032d93f642f64180aa3", ACME, 5n)))).toMatchObject({ kind: "erc20_transfer", asset: "0x5fbdb2315678afecb367f032d93f642f64180aa3" });
  });
});

describe("EthSimulateV1Simulator (response shapes recorded from the real RPC)", () => {
  it("computes the real balance change from the logs and approves a good spend", async () => {
    const r = await run(encodeAgentSpend(ZERO, ACME, 200000000000000n), OK);
    expect(r.verdict).toBe("approve");
    expect(r.rules.find((x) => x.rule === "simulation")!.detail).toMatch(/Balance change matches/);
    expect(r.usd).toBeCloseTo(0.0002, 6);
    expect(r.simulator).toMatch(/eth_simulateV1/);
  });
  it("sends an amount above the human threshold to the owner", async () => {
    const r = await run(encodeAgentSpend(ZERO, ACME, 400000000000000n), OK);
    expect(r.verdict).toBe("pending");
    expect(r.reasons.join(" ")).toMatch(/needs a human/);
    const approved = await run(encodeAgentSpend(ZERO, ACME, 400000000000000n), OK, { humanApprovedBy: "0xowner" });
    expect(approved.verdict).toBe("approve");
  });
  it("blocks over-limit amounts and reports the vault's own revert reason from the node", async () => {
    const r = await run(encodeAgentSpend(ZERO, ACME, 900000000000000n), REVERT("0x337434f4"));
    expect(r.verdict).toBe("block");
    expect(r.reasons.join(" ")).toMatch(/OverPerTxLimit/);
    expect(r.reasons.join(" ")).toMatch(/per-transaction/);
  });
  it("blocks a recipient that is not allowed, with the vault revert text", async () => {
    const r = await run(encodeAgentSpend(ZERO, "0x000000000000000000000000000000000000dead", 100n), REVERT("0x4ccc1eec"));
    expect(r.verdict).toBe("block");
    expect(r.reasons.join(" ")).toMatch(/RecipientNotAllowed/);
    expect(r.rules.find((x) => x.rule === "destination")!.ok).toBe(false);
  });
  it("decodes Error(string) reverts", async () => {
    const msg = "nope"; const hex = Buffer.from(msg).toString("hex").padEnd(64, "0");
    const data = "0x08c379a0" + "20".padStart(64, "0") + msg.length.toString(16).padStart(64, "0") + hex;
    const r = await sim(REVERT(data)).simulate({ action: act("0x"), decoded: decode(act("0x")) });
    expect(r.revertReason).toBe("reverted: nope");
  });
  it("fails closed when the RPC errors or has no result", async () => {
    const down = new EthSimulateV1Simulator(async () => { throw new Error("method not found"); }, AGENT, [VAULT]);
    const r = await decideStateless({ policy: policy(), rt: newRuntime(), action: act(encodeAgentSpend(ZERO, ACME, 100n)), simulator: down, threat, nonceOk: true });
    expect(r.verdict).toBe("block");
    expect(r.reasons.join(" ")).toMatch(/failing closed/);
    const empty = await sim([]).simulate({ action: act("0x"), decoded: decode(act("0x")) });
    expect(empty.ok).toBe(false);
  });
  it("catches a hidden drain: a call whose logs move more than it declares", async () => {
    const drain = [{ calls: [{ status: "0x1", logs: [{ address: NATIVE_TRANSFER_LOGGER, topics: [TOPICS.Transfer, T(VAULT), T("0xbad")], data: "0x" + (5n * 10n ** 15n).toString(16).padStart(64, "0") }] }] }];
    const r = await run(encodeAgentSpend(ZERO, ACME, 100000000000000n), drain);
    expect(r.verdict).toBe("block");
    expect(r.reasons.join(" ")).toMatch(/does more than it says|over the/);
  });
  it("reads approvals out of the logs", async () => {
    const logs = [{ calls: [{ status: "0x1", logs: [{ address: "0x5fbdb2315678afecb367f032d93f642f64180aa3", topics: [TOPICS.Approval, T(AGENT), T("0xabc")], data: "0x" + MAX_UINT256.toString(16) }] }] }];
    const r = await sim(logs).simulate({ action: act(encodeApprove("0xabc0000000000000000000000000000000000abc", MAX_UINT256), "0x5fbdb2315678afecb367f032d93f642f64180aa3"), decoded: decode(act("0x")) });
    expect(r.approvalsGranted[0]).toMatchObject({ spender: "0x" + "0".repeat(37) + "abc" });
  });
  it("blocks everything else an agent might try: unlimited approvals, plain sends, other contracts", async () => {
    const ok = [{ calls: [{ status: "0x1", logs: [] }] }];
    const unl = await run(encodeApprove(ACME, MAX_UINT256), ok, { action: act(encodeApprove(ACME, MAX_UINT256), "0x5fbdb2315678afecb367f032d93f642f64180aa3") });
    expect(unl.verdict).toBe("block");
    const plain = await decideStateless({ policy: policy(), rt: newRuntime(), action: { ...act("0x", ACME), data: undefined, value: 1000n }, simulator: sim(ok), threat, nonceOk: true });
    expect(plain.verdict).toBe("block"); // function "native_transfer" is not allowed: the agent key may only call agentSpend on the vault
    const other = await run(encodeTransfer(ACME, 1n), ok, { action: act(encodeTransfer(ACME, 1n), "0x5fbdb2315678afecb367f032d93f642f64180aa3") });
    expect(other.verdict).not.toBe("approve");
  });
  it("replay: a stale nonce is blocked", async () => {
    const r = await run(encodeAgentSpend(ZERO, ACME, 100n), OK, { nonceOk: false });
    expect(r.verdict).toBe("block");
    expect(r.rules.find((x) => x.rule === "replay")!.ok).toBe(false);
  });
});

describe("externally held audit chain (stateless API)", () => {
  it("makeEntry chains from a client-supplied head and verifies", () => {
    const e0 = makeEntry(null, { ts: 1, type: "decision", agentId: "a", agentName: "A", summary: "x", decision: "approve" });
    const e1 = makeEntry(e0, { ts: 2, type: "result", agentId: "a", agentName: "A", summary: "y", ref: 0 });
    expect(e1.prevHash).toBe(e0.hash);
    expect(verifyChain([e0, e1]).ok).toBe(true);
    expect(verifyChain([e0, { ...e1, summary: "z" }]).ok).toBe(false);
  });
});

// Optional: run against the REAL Robinhood testnet RPC. `LIVE_RPC=1 npx vitest run test/rpcsim.test.ts`
const live = process.env.LIVE_RPC ? describe : describe.skip;
live("LIVE: eth_simulateV1 against https://rpc.testnet.chain.robinhood.com (demo vault)", () => {
  const rpc = async (method: string, params: unknown[]) => {
    const r = await fetch("https://rpc.testnet.chain.robinhood.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    const j = (await r.json()) as { result?: unknown; error?: { message: string } };
    if (j.error) throw new Error(j.error.message);
    return j.result;
  };
  const real = new EthSimulateV1Simulator(rpc, AGENT, [VAULT]);
  it("a valid spend simulates OK and shows the real ETH leaving the vault", async () => {
    const a = act(encodeAgentSpend(ZERO, ACME, 200000000000000n));
    const r = await real.simulate({ action: a, decoded: decode(a) });
    expect(r.ok).toBe(true);
    expect(r.balanceChanges).toEqual([{ asset: "native", delta: -200000000000000n }]);
  }, 30000);
  it("an over-cap spend reverts with the vault's OverPerTxLimit", async () => {
    const a = act(encodeAgentSpend(ZERO, ACME, 900000000000000n));
    const r = await real.simulate({ action: a, decoded: decode(a) });
    expect(r.ok).toBe(false);
    expect(r.revertReason).toMatch(/OverPerTxLimit/);
  }, 30000);
  it("a non-allowlisted recipient reverts with RecipientNotAllowed", async () => {
    const a = act(encodeAgentSpend(ZERO, "0x000000000000000000000000000000000000dEaD", 100n));
    const r = await real.simulate({ action: a, decoded: decode(a) });
    expect(r.revertReason).toMatch(/RecipientNotAllowed/);
  }, 30000);
});
