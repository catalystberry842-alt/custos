import { lc } from "./calldata.js";
import { CUSTOS_ERRORS, NATIVE_TRANSFER_LOGGER, TOPICS } from "./vault.js";
import type { RpcFn, SimulationRequest, SimulationResult, Simulator } from "./simulate.js";

interface SimLog { address: string; topics: string[]; data: string }
interface SimCall { status: string; returnData?: string; logs?: SimLog[]; gasUsed?: string; error?: { message?: string; data?: string; code?: number } }

const topicAddr = (t: string | undefined) => (t ? "0x" + t.slice(-40).toLowerCase() : "");
const hexToBig = (h: string) => BigInt(h && h !== "0x" ? h : "0x0");

function revertText(err: SimCall["error"], ret?: string): string {
  const data = err?.data ?? ret ?? "";
  const sel = data.slice(0, 10).toLowerCase();
  const known = CUSTOS_ERRORS[sel];
  if (known) return `${known.name}: ${known.text}`;
  if (sel === "0x08c379a0" && data.length >= 10 + 128) {
    try {
      const len = Number(BigInt("0x" + data.slice(10 + 64, 10 + 128)));
      const hex = data.slice(10 + 128, 10 + 128 + len * 2);
      let s = ""; for (let i = 0; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
      return `reverted: ${s}`;
    } catch { /* fall through */ }
  }
  return err?.message ? `${err.message}${sel.length === 10 ? ` (${sel})` : ""}` : "reverted";
}

/**
 * REAL simulator for EVM chains that support `eth_simulateV1` (Robinhood Chain's public RPC does).
 * It executes the exact transaction the signer would send against the latest state, WITHOUT signing or sending:
 *  - reverts are detected with the contract's own error (e.g. the vault's OverPerTxLimit, RecipientNotAllowed),
 *  - with `traceTransfers` the node logs native-ETH movements, so we compute real balance changes (ETH and ERC-20
 *    Transfer events) leaving the tracked accounts, and any approvals the call would grant.
 * Fails CLOSED: if the RPC errors or lacks the method, the simulation result is `ok: false`.
 */
export class EthSimulateV1Simulator implements Simulator {
  readonly name = "eth_simulateV1 (real node simulation)";
  constructor(private rpc: RpcFn, private from: string, private tracked: string[] = []) {}

  async simulate({ action }: SimulationRequest): Promise<SimulationResult> {
    const tracked = new Set([this.from, ...this.tracked].map(lc));
    const res: SimulationResult = { ok: true, balanceChanges: [], approvalsGranted: [], notes: [], simulator: this.name };
    const call = { from: this.from, to: action.to, data: action.data ?? "0x", value: "0x" + (action.value ?? 0n).toString(16) };
    let out: SimCall | undefined;
    try {
      const r = (await this.rpc("eth_simulateV1", [{ blockStateCalls: [{ calls: [call] }], validation: false, traceTransfers: true }, "latest"])) as { calls?: SimCall[] }[];
      out = r?.[0]?.calls?.[0];
    } catch (e) {
      return { ...res, ok: false, revertReason: `simulation unavailable, failing closed: ${e instanceof Error ? e.message : String(e)}` };
    }
    if (!out) return { ...res, ok: false, revertReason: "simulation returned no result, failing closed" };
    if (out.gasUsed) res.notes.push(`simulated gas ${hexToBig(out.gasUsed)}`);
    if (out.status !== "0x1") return { ...res, ok: false, revertReason: revertText(out.error, out.returnData) };

    const net = new Map<string, bigint>();
    for (const l of out.logs ?? []) {
      const t0 = l.topics[0]?.toLowerCase();
      if (t0 === TOPICS.Transfer && l.topics.length === 3) {
        const from = topicAddr(l.topics[1]), to = topicAddr(l.topics[2]);
        const asset = lc(l.address) === NATIVE_TRANSFER_LOGGER ? "native" : lc(l.address);
        const amt = hexToBig(l.data);
        if (tracked.has(from)) net.set(asset, (net.get(asset) ?? 0n) - amt);
        if (tracked.has(to)) net.set(asset, (net.get(asset) ?? 0n) + amt);
      } else if (t0 === TOPICS.Approval && l.topics.length === 3 && tracked.has(topicAddr(l.topics[1]))) {
        res.approvalsGranted.push({ asset: lc(l.address), spender: topicAddr(l.topics[2]), amountRaw: hexToBig(l.data) });
      }
    }
    for (const [asset, delta] of net) if (delta !== 0n) res.balanceChanges.push({ asset, delta });
    if (res.balanceChanges.length === 0) res.notes.push("no balance change of the tracked accounts");
    return res;
  }
}
