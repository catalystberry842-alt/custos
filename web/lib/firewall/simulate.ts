// AUTO-COPIED from firewall/src/simulate.ts by scripts/sync-firewall.sh — do not edit here.
import { decode } from "./calldata";
import type { Decoded, RawAction } from "./types";

export interface BalanceChange { asset: string; delta: bigint }
export interface SimulationResult {
  ok: boolean;
  revertReason?: string;
  /** net balance change of the agent's wallet/vault, per asset (negative = outflow) */
  balanceChanges: BalanceChange[];
  /** allowances this call would grant */
  approvalsGranted: { asset: string; spender: string; amountRaw: bigint }[];
  notes: string[];
  simulator: string;
}
export interface SimulationRequest { action: RawAction; decoded: Decoded }

/** Pluggable. A real deployment implements this with eth_call / debug_traceCall / Tenderly / Anvil fork. */
export interface Simulator { readonly name: string; simulate(req: SimulationRequest): Promise<SimulationResult> }

export type MockBehavior = "ok" | "revert" | "drain";
export interface MockWorld {
  /** the simulated wallet/vault balances (raw units) */
  balances: Record<string, bigint>;
  contracts: Record<string, { name: string; behavior: MockBehavior }>;
}

/**
 * Deterministic simulator for simulation mode. It models: insufficient balance (revert), contracts that revert, and
 * contracts that secretly move the whole balance ("drain") so the firewall can catch a call that does more than it says.
 */
export class MockSimulator implements Simulator {
  readonly name = "mock-simulator (deterministic, simulation mode)";
  constructor(public world: MockWorld) {}
  async simulate({ decoded: d, action }: SimulationRequest): Promise<SimulationResult> {
    const res: SimulationResult = { ok: true, balanceChanges: [], approvalsGranted: [], notes: [], simulator: this.name };
    const bal = (a: string) => this.world.balances[a] ?? 0n;
    const out = (asset: string, amt: bigint) => {
      if (amt > bal(asset)) { res.ok = false; res.revertReason = "insufficient balance: the call would revert"; return; }
      res.balanceChanges.push({ asset, delta: -amt });
    };
    switch (d.kind) {
      case "native_transfer": out("native", d.amountRaw ?? 0n); break;
      case "erc20_transfer":
      case "erc20_transferFrom": out(d.asset!, d.amountRaw ?? 0n); break;
      case "approve":
      case "permit":
      case "setApprovalForAll":
        res.approvalsGranted.push({ asset: d.asset!, spender: d.spender!, amountRaw: d.amountRaw ?? 0n });
        if (d.unlimited) res.notes.push("grants an effectively unlimited allowance");
        break;
      case "contract_call": {
        const c = this.world.contracts[d.target];
        if (!c) { res.notes.push("contract unknown to the simulator: behaviour not modelled"); break; }
        if (c.behavior === "revert") { res.ok = false; res.revertReason = `${c.name} reverts`; break; }
        if (c.behavior === "drain") {
          for (const [asset, b] of Object.entries(this.world.balances)) if (b > 0n) res.balanceChanges.push({ asset, delta: -b });
          res.notes.push(`${c.name} moves the entire balance of the wallet`);
        }
        if (action.value) out("native", action.value);
        break;
      }
    }
    return res;
  }
}

export type RpcFn = (method: string, params: unknown[]) => Promise<unknown>;
/**
 * Ready-to-wire real simulator: eth_call detects reverts, eth_estimateGas catches gas failures. It cannot compute
 * balance changes (that needs a trace or Tenderly-style simulation), so it reports none and says so.
 * Swap in a tracing simulator by implementing `Simulator`.
 */
export class EthCallSimulator implements Simulator {
  readonly name = "eth_call simulator";
  constructor(private rpc: RpcFn, private from: string) {}
  async simulate({ action, decoded }: SimulationRequest): Promise<SimulationResult> {
    const tx = { from: this.from, to: action.to, data: action.data ?? "0x", value: "0x" + (action.value ?? 0n).toString(16) };
    const res: SimulationResult = { ok: true, balanceChanges: [], approvalsGranted: [], notes: ["no balance trace: only revert detection"], simulator: this.name };
    if (decoded.kind === "approve" || decoded.kind === "permit" || decoded.kind === "setApprovalForAll")
      res.approvalsGranted.push({ asset: decoded.asset!, spender: decoded.spender!, amountRaw: decoded.amountRaw ?? 0n });
    try { await this.rpc("eth_call", [tx, "latest"]); await this.rpc("eth_estimateGas", [tx]); }
    catch (e) { res.ok = false; res.revertReason = e instanceof Error ? e.message : String(e); }
    return res;
  }
}
export { decode };
