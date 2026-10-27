import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { encodeFunctionData, parseEther } from "viem";
import { fromJson, toJson } from "../lib/live/json";
import { deriveLiveState } from "../lib/live/policy";
import { approvalMessage } from "../lib/live/types";
import { vaultAbi } from "../lib/live/abi";
import { verifyChain } from "../lib/firewall";
import type { ChainEvent, VaultSnapshot } from "../lib/live/chain";

const VAULT = "0x7Cd7D6b00023B298EB869E3201af077daC71955C" as const;
const ACME = "0xa93f5F5f3E3a1C9a5017298cd64A643Ec16f717e" as const;
const ZERO = "0x0000000000000000000000000000000000000000" as const;
const owner = privateKeyToAccount(generatePrivateKey());
const agent = privateKeyToAccount(generatePrivateKey());

const snap = (over: Partial<VaultSnapshot> = {}): VaultSnapshot => ({
  vault: VAULT, owner: owner.address, agent: agent.address, status: "Active", agentState: "active", expiry: 2e9, lastCheckIn: 1e9, interval: 86400, grace: 86400, now: 1e9,
  balanceWei: parseEther("0.004"), agentGasWei: parseEther("0.002"), perTxWei: parseEther("0.0005"), perPeriodWei: parseEther("0.002"), remainingWei: parseEther("0.002"),
  periodResetsAt: 0, periodSecs: 3600, maxCalls: 5, callsUsed: 0, callWindowStart: 0, recipients: [ACME], ...over,
});
const spent = (amt: string, ts: number): ChainEvent => ({ name: "AgentSpent", args: { agent: agent.address, asset: ZERO, to: ACME, amount: parseEther(amt) }, block: 1, ts, txHash: "0x01", logIndex: 0 });
const data = (amt: string) => encodeFunctionData({ abi: vaultAbi, functionName: "agentSpend", args: [ZERO, ACME, parseEther(amt)] });

describe("live json", () => {
  it("round-trips bigint", () => { expect(fromJson<{ a: bigint }>(toJson({ a: 10n ** 20n })).a).toBe(10n ** 20n); });
});

describe("policy derived from the chain", () => {
  it("maps vault config to firewall policy and counts nonce from AgentSpent events", () => {
    const s = deriveLiveState(snap(), [spent("0.0002", 1_000), spent("0.0001", 2_000)]);
    expect(s.policy).toMatchObject({ unit: "ETH", perTxUsd: 0.0005, functions: ["agentSpend"], contracts: [VAULT.toLowerCase()], recipients: [ACME.toLowerCase()] });
    expect(s.policy.humanApprovalAboveUsd).toBeCloseTo(0.0003, 8);
    expect(s.nextNonce).toBe(2);
    expect(s.rt.lastNonce).toBe(1);
    expect(s.rt.cumulativeUsd).toBeCloseTo(0.0003, 8);
    expect(s.rt.frozen).toBe(false);
  });
  it("freezes the runtime when the contract says the agent is frozen", () => {
    const s = deriveLiveState(snap({ agentState: "frozen_owner" }), []);
    expect(s.rt.frozen).toBe(true);
    expect(s.rt.frozenReason).toMatch(/kill switch/);
  });
});

/* submitLive with a mocked chain reader and a mocked node (eth_simulateV1) */
const T = (a: string) => "0x" + a.replace(/^0x/, "").padStart(64, "0");
vi.mock("../lib/live/chain", async (orig) => {
  const real = await orig<typeof import("../lib/live/chain")>();
  return { ...real, publicClient: () => ({}) as never, readVault: vi.fn(), vaultEvents: vi.fn() };
});
const chainMod = await import("../lib/live/chain");

describe("submitLive", () => {
  beforeEach(() => {
    vi.mocked(chainMod.readVault).mockResolvedValue(snap());
    vi.mocked(chainMod.vaultEvents).mockResolvedValue([]);
    delete process.env.AGENT_PRIVATE_KEY;
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: string }) => {
      const b = JSON.parse(init.body) as { method: string; params: [{ blockStateCalls: { calls: { data: string }[] }[] }] };
      const d = b.params[0].blockStateCalls[0]!.calls[0]!.data;
      const amt = BigInt("0x" + d.slice(-64));
      const over = amt > parseEther("0.0005");
      const result = [{ calls: [over
        ? { status: "0x0", returnData: "0x", logs: [], error: { code: 3, message: "execution reverted", data: "0x337434f4" } }
        : { status: "0x1", returnData: "0x", gasUsed: "0x1", logs: [{ address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", T(VAULT), T(ACME)], data: "0x" + amt.toString(16).padStart(64, "0") }] }] }];
      return { json: async () => ({ jsonrpc: "2.0", id: 1, result }) } as Response;
    }));
  });
  afterEach(() => vi.unstubAllGlobals());
  const body = (amt: string, nonce = 0, extra = {}) => ({ vault: VAULT, tx: { to: VAULT, data: data(amt) }, nonce, prevHead: null, intent: "test", ...extra });

  it("blocks an over-cap spend and returns a verifiable hash chain", async () => {
    const { submitLive } = await import("../lib/live/server");
    const r = await submitLive(body("0.002"));
    expect(r.verdict).toBe("block");
    expect(r.reasons.join(" ")).toMatch(/OverPerTxLimit/);
    expect(verifyChain(r.entries.map((e) => e.entry)).ok).toBe(true);
  });
  it("blocks a replayed nonce", async () => {
    vi.mocked(chainMod.vaultEvents).mockResolvedValue([spent("0.0002", Date.now())]);
    const { submitLive } = await import("../lib/live/server");
    expect((await submitLive(body("0.0002", 0))).verdict).toBe("block");
  });
  it("asks the owner above the threshold and accepts only the owner's signature", async () => {
    const { submitLive, actionDigest } = await import("../lib/live/server");
    const first = await submitLive(body("0.0004"));
    expect(first.verdict).toBe("pending");
    const msg = approvalMessage(VAULT, 0, actionDigest({ to: VAULT, data: data("0.0004") }));
    expect(first.approvalMessage).toBe(msg);
    const stranger = privateKeyToAccount(generatePrivateKey());
    const bad = await submitLive(body("0.0004", 0, { approval: { signature: await stranger.signMessage({ message: msg }) } }));
    expect(bad.verdict).toBe("pending");
    const good = await submitLive(body("0.0004", 0, { approval: { signature: await owner.signMessage({ message: msg }) } }));
    expect(good.verdict).toBe("approve");
    expect(good.executed?.ok).toBe(false); // no agent key configured in tests: nothing is signed
    expect(good.executed?.detail).toMatch(/No agent key/);
  });
  it("never lets the agent key sign anything but vault.agentSpend", async () => {
    process.env.AGENT_PRIVATE_KEY = generatePrivateKey().replace(/^0x/, "");
    const { submitLive } = await import("../lib/live/server");
    const r = await submitLive({ vault: VAULT, tx: { to: "0x000000000000000000000000000000000000dEaD", data: "0x1249c58b" }, nonce: 0, prevHead: null });
    expect(r.verdict).toBe("block");
    expect(r.executed).toBeUndefined();
  });
});
