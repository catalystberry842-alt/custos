import { createPublicClient, decodeEventLog, formatEther, http, toEventSelector, type Hex, type PublicClient } from "viem";
import { AGENT_STATE, STATUS, factoryAbi, vaultAbi } from "./abi";
import { ATTACKER, DEPLOY, ZERO, chain } from "./config";

export const rpcUrl = DEPLOY.rpc;
export const publicClient = (): PublicClient => createPublicClient({ chain, transport: http(rpcUrl) }) as PublicClient;
const CHUNK = 900_000n;

export interface VaultSnapshot {
  vault: `0x${string}`; owner: `0x${string}`; agent: `0x${string}`;
  status: (typeof STATUS)[number]; agentState: (typeof AGENT_STATE)[number];
  expiry: number; lastCheckIn: number; interval: number; grace: number; now: number;
  balanceWei: bigint; agentGasWei: bigint;
  perTxWei: bigint; perPeriodWei: bigint; remainingWei: bigint; periodResetsAt: number; periodSecs: number; maxCalls: number; callsUsed: number; callWindowStart: number;
  recipients: `0x${string}`[];
}

export async function readVault(c: PublicClient, vault: `0x${string}`): Promise<VaultSnapshot> {
  const r = (fn: string, args: unknown[] = []) => c.readContract({ address: vault, abi: vaultAbi, functionName: fn as never, args: args as never }) as Promise<never>;
  const [owner, agent, status, agentState, expiry, lastCheckIn, interval, grace, period, maxCalls, calls, cws, limit, allowance, recips, balanceWei, block] = await Promise.all([
    r("owner"), r("agent"), r("status"), r("agentState"), r("expiry"), r("lastCheckIn"), r("interval"), r("grace"), r("agentPeriod"), r("agentMaxCalls"), r("agentCalls"), r("agentCallWindowStart"),
    r("assetLimit", [ZERO]), r("agentAllowance", [ZERO]), r("recipients"), c.getBalance({ address: vault }), c.getBlock(),
  ]) as [`0x${string}`, `0x${string}`, number, number, bigint, bigint, bigint, bigint, bigint, number, number, bigint, readonly [bigint, bigint], readonly [bigint, bigint, bigint], `0x${string}`[], bigint, { timestamp: bigint }];
  const agentGasWei = agent === ZERO ? 0n : await c.getBalance({ address: agent });
  return {
    vault, owner, agent, status: STATUS[status] ?? "Active", agentState: AGENT_STATE[agentState] ?? "none",
    expiry: Number(expiry), lastCheckIn: Number(lastCheckIn), interval: Number(interval), grace: Number(grace), now: Number(block.timestamp),
    balanceWei, agentGasWei, perTxWei: limit[0], perPeriodWei: limit[1], remainingWei: allowance[1], periodResetsAt: Number(allowance[2]), periodSecs: Number(period),
    maxCalls: Number(maxCalls), callsUsed: Number(calls), callWindowStart: Number(cws), recipients: [...recips],
  };
}

export interface ChainEvent {
  name: string; args: Record<string, unknown>; block: number; ts: number; txHash: Hex; logIndex: number;
}
interface RawLog { address: string; topics: Hex[]; data: Hex; blockNumber: Hex; blockTimestamp?: Hex; transactionHash: Hex; logIndex: Hex }

const hasTs = (l: RawLog) => !!l.blockTimestamp && BigInt(l.blockTimestamp) > 0n;

async function rawLogs(c: PublicClient, params: { address: string; topics?: (Hex | null)[]; from: bigint; to: bigint }): Promise<RawLog[]> {
  const out: RawLog[] = [];
  for (let f = params.from; f <= params.to; f += CHUNK) {
    const t = f + CHUNK - 1n > params.to ? params.to : f + CHUNK - 1n;
    const part = (await c.request({ method: "eth_getLogs", params: [{ address: params.address as Hex, topics: params.topics, fromBlock: `0x${f.toString(16)}`, toBlock: `0x${t.toString(16)}` }] } as never)) as RawLog[];
    out.push(...part);
  }
  return out;
}

/** The block a vault was created in: scans the factory's VaultDeployed logs (chunked; the public RPC limits ranges). */
export async function vaultCreationBlock(c: PublicClient, vault: `0x${string}`): Promise<bigint> {
  if (vault.toLowerCase() === DEPLOY.demoVault.toLowerCase()) return BigInt(DEPLOY.demoVaultBlock);
  const latest = await c.getBlockNumber();
  const topic = "0x" + "0".repeat(24) + vault.slice(2).toLowerCase();
  const sig = toEventSelector("VaultDeployed(address,address,address)");
  const logs = await rawLogs(c, { address: DEPLOY.factory, topics: [sig, null, topic as Hex], from: BigInt(DEPLOY.factoryBlock), to: latest });
  return logs[0] ? BigInt(logs[0].blockNumber) : BigInt(DEPLOY.factoryBlock);
}

/** Every event the vault emitted since creation, decoded, straight from the chain (no indexer). */
export async function vaultEvents(c: PublicClient, vault: `0x${string}`, fromBlock?: bigint): Promise<ChainEvent[]> {
  const from = fromBlock ?? (await vaultCreationBlock(c, vault));
  const latest = await c.getBlockNumber();
  const logs = await rawLogs(c, { address: vault, from, to: latest });
  const needTs = [...new Set(logs.filter((l) => !hasTs(l)).map((l) => l.blockNumber))];
  const tsByBlock = new Map<string, number>();
  await Promise.all(needTs.map(async (b) => { const blk = await c.getBlock({ blockNumber: BigInt(b) }); tsByBlock.set(b, Number(blk.timestamp)); }));
  const out: ChainEvent[] = [];
  for (const l of logs) {
    try {
      const d = decodeEventLog({ abi: vaultAbi, data: l.data, topics: l.topics as [Hex, ...Hex[]] });
      out.push({ name: d.eventName, args: (d.args ?? {}) as Record<string, unknown>, block: Number(BigInt(l.blockNumber)), ts: hasTs(l) ? Number(BigInt(l.blockTimestamp!)) : tsByBlock.get(l.blockNumber)!, txHash: l.transactionHash, logIndex: Number(BigInt(l.logIndex)) });
    } catch { /* an event this UI does not know */ }
  }
  return out.sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);
}

export async function vaultsOf(c: PublicClient, owner: `0x${string}`) {
  return (await c.readContract({ address: DEPLOY.factory, abi: factoryAbi, functionName: "vaultsOf", args: [owner] })) as `0x${string}`[];
}
export function eth(wei: bigint): string {
  const n = Number(formatEther(wei));
  if (n === 0) return "0 ETH";
  if (n >= 1) return `${n.toFixed(3)} ETH`;
  return `${n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")} ETH`;
}
export { ATTACKER };
