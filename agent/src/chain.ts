import { createPublicClient, http, type Address } from "viem";
import * as M from "./chainModel.js";
import type { Snapshot } from "./chainModel.js";

/** Read side: the agent only ever READS chain state. */
export interface ChainReader {
  read(id: string): Promise<Snapshot>;
}

/** Simulated write side, for mock mode and demos. Real chains: owners sign check-ins in their own wallet. */
export interface SimWritable {
  checkIn(id: string, now: number): { cancelled: boolean };
  pause(id: string, now: number, durationMs: number): void;
  approve(id: string, guardianId: string, now: number, outcome?: M.Outcome): { challengeStarted: boolean };
  execute(id: string, now: number): void;
  // AI-agent layer
  agentSpend(id: string, now: number, asset: string, to: string, amount: number): void;
  guardianFreezeAgent(id: string, now: number): void;
  ownerFreezeAgent(id: string, now: number): void;
  ownerUnfreezeAgent(id: string, now: number): void;
}

export class SimChain implements ChainReader, SimWritable {
  private vaults = new Map<string, Snapshot>();
  add(id: string, snap: Snapshot) { this.vaults.set(id, snap); }
  private get(id: string): Snapshot {
    const s = this.vaults.get(id);
    if (!s) throw new Error(`unknown switch ${id}`);
    return s;
  }
  async read(id: string): Promise<Snapshot> {
    return structuredClone(this.get(id));
  }
  checkIn(id: string, now: number) { return M.checkIn(this.get(id), now); }
  pause(id: string, now: number, d: number) { M.pause(this.get(id), now, d); }
  approve(id: string, g: string, now: number, outcome: M.Outcome = "release") { return M.approve(this.get(id), now, g, outcome); }
  execute(id: string, now: number) { M.execute(this.get(id), now); }
  agentSpend(id: string, now: number, asset: string, to: string, amount: number) { M.agentSpend(this.get(id), now, asset, to, amount); }
  guardianFreezeAgent(id: string, now: number) { M.guardianFreezeAgent(this.get(id), now); }
  ownerFreezeAgent(id: string, now: number) { M.ownerFreezeAgent(this.get(id), now); }
  ownerUnfreezeAgent(id: string, now: number) { M.ownerUnfreezeAgent(this.get(id), now); }
}

export const isSimWritable = (c: unknown): c is SimWritable =>
  typeof c === "object" && c !== null && "approve" in c && "execute" in c;

const ABI = [
  { type: "function", name: "interval", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "grace", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "challengeWindow", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "fallbackDelay", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "lastCheckIn", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "pausedUntil", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "challengeEnd", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "epoch", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "threshold", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "approvalCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "guardianCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "released", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "closed", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  // agent layer (read-only; amounts stay in token units, so per-asset budgets are NOT mirrored here: see README gaps)
  { type: "function", name: "agent", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "agentPeriod", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "agentLateAllowance", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "agentOwnerFrozen", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "agentGuardianFrozenEpoch", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "successor", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "pendingOutcome", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

const ZERO = "0x0000000000000000000000000000000000000000";

/** Read-only viem reader for a deployed Heirloom vault. `id` is the vault address. No keys involved. */
export class ViemChainReader implements ChainReader {
  private client;
  constructor(rpcUrl: string) {
    this.client = createPublicClient({ transport: http(rpcUrl) });
  }
  async read(id: string): Promise<Snapshot> {
    const address = id as Address;
    const c = this.client;
    const r = <N extends (typeof ABI)[number]["name"]>(functionName: N) =>
      c.readContract({ address, abi: ABI, functionName }) as Promise<any>;
    const [interval, grace, cw, fb, last, pu, ce, epoch, thr, ac, gc, rel, closed] = await Promise.all([
      r("interval"), r("grace"), r("challengeWindow"), r("fallbackDelay"), r("lastCheckIn"), r("pausedUntil"),
      r("challengeEnd"), r("epoch"), r("threshold"), r("approvalCount"), r("guardianCount"), r("released"), r("closed"),
    ]);
    const ms = (x: bigint) => Number(x) * 1000;
    const [agentAddr, period, late, ownerFrozen, gFrozen, succ, outcome] = await Promise.all([
      r("agent"), r("agentPeriod"), r("agentLateAllowance"), r("agentOwnerFrozen"), r("agentGuardianFrozenEpoch"), r("successor"), r("pendingOutcome"),
    ]);
    const hasAgent = (agentAddr as string).toLowerCase() !== ZERO;
    return {
      agent: hasAgent
        ? { name: "AI agent", periodMs: ms(period), lateAllowanceMs: ms(late), ownerFrozen, guardianFrozenEpoch: Number(gFrozen), limits: [], recipients: [] }
        : undefined,
      successorName: (succ as string).toLowerCase() !== ZERO ? "your successor" : undefined,
      pendingOutcome: Number(outcome) === 1 ? "handover" : "release",
      intervalMs: ms(interval), graceMs: ms(grace), challengeMs: ms(cw), fallbackMs: ms(fb),
      lastCheckIn: ms(last), pausedUntil: ms(pu), epoch: Number(epoch), threshold: Number(thr),
      guardianCount: Number(gc),
      // chain exposes only a count for cheap reads; ids not needed for messaging
      approvedBy: Array.from({ length: Number(ac) }, (_, i) => `g${i}`),
      challengeEnd: ce === 0n ? null : ms(ce), released: rel, closed,
    };
  }
}
