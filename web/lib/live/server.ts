// Server side of the live firewall: decide with the real simulator, then (only on approve) sign with the demo agent key.
import { recoverMessageAddress, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  EthSimulateV1Simulator, canonical, decideStateless, makeEntry, sha256Hex, slimRules, type AuditEntry, type RawAction,
} from "../firewall";
import { publicClient, readVault, vaultEvents, type VaultSnapshot } from "./chain";
import { DEPLOY, chain } from "./config";
import { deriveLiveState, liveThreat } from "./policy";
import { approvalMessage, type SignedEntry, type SubmitBody, type SubmitResult } from "./types";

export const AGENT_NAME = "Atlas (testnet agent)";
const locks = new Map<string, Promise<unknown>>();
/** Serialise requests per vault so two requests cannot both pass the same on-chain nonce. */
export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  locks.set(key, next);
  try { return await next; } finally { if (locks.get(key) === next) locks.delete(key); }
}

const rpc = async (method: string, params: unknown[]) => {
  const r = await fetch(DEPLOY.rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), cache: "no-store" });
  const j = (await r.json()) as { result?: unknown; error?: { message: string } };
  if (j.error) throw new Error(j.error.message);
  return j.result;
};

export function agentAccount() {
  const k = process.env.AGENT_PRIVATE_KEY;
  if (!k) return null;
  return privateKeyToAccount((k.startsWith("0x") ? k : `0x${k}`) as Hex);
}

export async function liveState(vault: `0x${string}`) {
  const c = publicClient();
  const [snap, events] = await Promise.all([readVault(c, vault), vaultEvents(c, vault)]);
  return { snap, events, ...deriveLiveState(snap, events) };
}
export const actionDigest = (tx: SubmitBody["tx"]) => sha256Hex(canonical({ to: tx.to.toLowerCase(), data: (tx.data ?? "0x").toLowerCase(), value: tx.value ?? 0n })).slice(0, 32);

export async function submitLive(body: SubmitBody): Promise<SubmitResult> {
  const vault = body.vault.toLowerCase() as `0x${string}`;
  return withLock(vault, async () => {
    const acct = agentAccount();
    const { snap, policy, rt, nextNonce } = await liveState(vault);
    const agentAddr = snap.agent;
    const action: RawAction = { agentId: agentAddr, nonce: body.nonce, ts: Date.now(), chainId: DEPLOY.chainId, to: body.tx.to, data: body.tx.data, value: body.tx.value, intent: body.intent };
    const digest = actionDigest(body.tx);

    let approvedBy: string | undefined;
    if (body.approval) {
      try {
        const who = await recoverMessageAddress({ message: approvalMessage(vault, body.nonce, digest), signature: body.approval.signature });
        if (who.toLowerCase() === snap.owner.toLowerCase()) approvedBy = who;
      } catch { /* invalid signature: treated as no approval */ }
    }
    const res = await decideStateless({
      policy, rt, action, simulator: new EthSimulateV1Simulator(rpc, agentAddr, [vault]), threat: liveThreat(vault),
      nonceOk: body.nonce === nextNonce, humanApprovedBy: approvedBy,
    });

    const signer = acct;
    const sign = async (e: AuditEntry): Promise<SignedEntry> => ({ entry: e, sig: signer ? await signer.signMessage({ message: e.hash }) : ("0x" as Hex) });
    const entries: SignedEntry[] = [];
    let prev = body.prevHead;
    const push = async (e: AuditEntry) => { entries.push(await sign(e)); prev = { index: e.index, hash: e.hash }; };
    const pHash = sha256Hex(canonical(policy));
    const verb = res.verdict === "approve" ? "APPROVED" : res.verdict === "block" ? "BLOCKED" : "PENDING owner approval";
    await push(makeEntry(prev, {
      ts: action.ts, type: approvedBy ? "resolution" : "decision", agentId: agentAddr, agentName: AGENT_NAME, policyHash: pHash, actor: approvedBy,
      summary: `${AGENT_NAME} → ${res.decoded.fn}: ${verb}${approvedBy ? " (owner approved)" : ""}`,
      action: { nonce: action.nonce, to: action.to.toLowerCase(), fn: res.decoded.fn, asset: res.decoded.asset, recipient: res.decoded.recipient, spender: res.decoded.spender, usd: res.usd, intent: body.intent },
      rules: slimRules(res.rules), decision: res.verdict, reasons: res.reasons,
    }));

    const out: SubmitResult = { verdict: res.verdict, rules: res.rules, reasons: res.reasons, fn: res.decoded.fn, usd: res.usd, entries, agent: agentAddr, simulator: res.simulator, simNotes: res.simNotes, nextNonce };
    if (res.verdict === "pending") out.approvalMessage = approvalMessage(vault, body.nonce, digest);
    if (res.verdict !== "approve") return out;

    // ── approved: the ONLY thing the agent key will ever sign is vault.agentSpend, and only after the firewall said yes ──
    const relayable = res.decoded.fn === "agentSpend" && res.decoded.target === vault && (body.tx.to.toLowerCase() === vault);
    let exec: NonNullable<SubmitResult["executed"]>;
    if (!acct) exec = { ok: false, detail: "No agent key is configured on this server, so nothing was signed." };
    else if (acct.address.toLowerCase() !== agentAddr.toLowerCase()) exec = { ok: false, detail: "This vault's agent is a different key than the demo agent held by this server, so nothing was signed." };
    else if (!relayable) exec = { ok: false, detail: "Approved, but the agent key only ever signs vault.agentSpend calls, so this action was not sent." };
    else {
      try {
        const wallet = createWalletClient({ account: acct, chain, transport: http(DEPLOY.rpc) });
        const hash = await wallet.sendTransaction({ to: vault, data: body.tx.data as Hex, value: 0n });
        const rc = await publicClient().waitForTransactionReceipt({ hash, timeout: 60_000 });
        exec = { ok: rc.status === "success", txHash: hash, block: Number(rc.blockNumber), detail: rc.status === "success" ? "executed on-chain" : "transaction reverted on-chain" };
      } catch (e) { exec = { ok: false, detail: `send failed: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}` }; }
    }
    out.executed = exec;
    out.nextNonce = exec.ok ? nextNonce + 1 : nextNonce;
    await push(makeEntry(prev, { ts: Date.now(), type: "result", agentId: agentAddr, agentName: AGENT_NAME, policyHash: pHash, summary: exec.ok ? `Executed on-chain: ${exec.txHash}` : `Not executed: ${exec.detail}`, ref: entries[0]!.entry.index, result: { ok: exec.ok, detail: exec.detail, txHash: exec.txHash } }));
    return out;
  });
}

export type { VaultSnapshot };
