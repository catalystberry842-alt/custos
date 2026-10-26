"use client";
/**
 * OPTIONAL real-chain panel (viem + the browser's injected EIP-1193 wallet only: no WalletConnect,
 * Coinbase or Phantom SDKs). It never asks for keys: the wallet signs. Read-only lookup + owner check-in.
 * Loaded lazily, only if the user opens the panel.
 */
import { useCallback, useEffect, useState } from "react";
import { createPublicClient, createWalletClient, custom, http, isAddress, type Address, type EIP1193Provider } from "viem";
import { monad } from "viem/chains";

const ABI = [
  { type: "function", name: "status", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "lastCheckIn", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "interval", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "checkIn", stateMutability: "nonpayable", inputs: [], outputs: [] },
] as const;
const STATUS = ["Active", "Grace", "AwaitingGuardians", "Challenge", "Executable", "Paused", "Released", "Closed"];

const pub = createPublicClient({ chain: monad, transport: http("https://rpc.monad.xyz") });
type Eth = EIP1193Provider & { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
const eth = (): Eth | undefined => (typeof window !== "undefined" ? (window as unknown as { ethereum?: Eth }).ethereum : undefined);

interface Info { status: string; last: string; interval: string; owner: Address }

export default function WalletPanel() {
  const [acct, setAcct] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [vault, setVault] = useState("");
  const [info, setInfo] = useState<Info | null>(null);
  const [err, setErr] = useState("");
  const [tx, setTx] = useState("");
  const [busy, setBusy] = useState(false);
  const v = isAddress(vault) ? (vault as Address) : undefined;

  const connect = async () => {
    setErr("");
    const p = eth();
    if (!p) return setErr("No injected wallet found in this browser.");
    try {
      const [a] = (await p.request({ method: "eth_requestAccounts" })) as Address[];
      setAcct(a);
      setChainId(Number(await p.request({ method: "eth_chainId" })));
    } catch (e) { setErr((e as Error).message.slice(0, 140)); }
  };
  const switchToMonad = async () => {
    const p = eth(); if (!p) return;
    try {
      await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x8f" }] });
    } catch {
      try {
        await p.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0x8f", chainName: "Monad", nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 }, rpcUrls: ["https://rpc.monad.xyz"], blockExplorerUrls: ["https://monadscan.com"] }] });
      } catch (e) { setErr((e as Error).message.slice(0, 140)); }
    }
    setChainId(Number(await p.request({ method: "eth_chainId" })));
  };

  const load = useCallback(async () => {
    if (!v) { setInfo(null); return; }
    setErr("");
    try {
      const rc = <N extends "status" | "lastCheckIn" | "interval" | "owner">(functionName: N) => pub.readContract({ address: v, abi: ABI, functionName });
      const [s, l, i, o] = await Promise.all([rc("status"), rc("lastCheckIn"), rc("interval"), rc("owner")]);
      setInfo({ status: STATUS[Number(s)] ?? "?", last: new Date(Number(l) * 1000).toLocaleString(), interval: `${Number(i) / 86400}d`, owner: o as Address });
    } catch { setInfo(null); setErr("Couldn't read that address on Monad mainnet. Is it an Heirloom vault?"); }
  }, [v]);
  useEffect(() => { void load(); }, [load]);

  const checkIn = async () => {
    const p = eth(); if (!p || !v || !acct) return;
    setBusy(true); setErr("");
    try {
      const w = createWalletClient({ chain: monad, transport: custom(p), account: acct });
      setTx(await w.writeContract({ address: v, abi: ABI, functionName: "checkIn" }));
    } catch (e) { setErr((e as Error).message.slice(0, 160)); }
    setBusy(false);
  };

  const wrong = !!acct && chainId !== monad.id;
  const isOwner = !!info && !!acct && info.owner.toLowerCase() === acct.toLowerCase();
  return (
    <div className="stack">
      <p className="s accent">⚠ Experimental. The contracts are unaudited and not deployed by this project. Use only addresses you trust, with funds you can afford to lose.</p>
      {!acct ? (
        <div className="row"><button className="btn sm" onClick={connect}>Connect browser wallet</button><span className="s dim">Monad · chain 143 · injected wallets only</span></div>
      ) : (
        <div className="row between wrapflex">
          <span className="mono">{acct.slice(0, 6)}…{acct.slice(-4)}</span>
          {wrong && <button className="btn sm primary" onClick={switchToMonad}>Switch to Monad (143)</button>}
          <button className="btn sm ghost" onClick={() => { setAcct(undefined); setTx(""); }}>Disconnect</button>
        </div>
      )}
      <div className="field">
        <label className="s mut" htmlFor="vault">Vault address (read-only lookup)</label>
        <input id="vault" className={`input ${vault && !v ? "bad" : ""}`} placeholder="0x… Heirloom vault on Monad" value={vault} onChange={(e) => setVault(e.target.value.trim())} />
      </div>
      {info && (
        <div className="card stack" style={{ gap: 4 }}>
          <div className="row between"><span className="mut">Status</span><b>{info.status}</b></div>
          <div className="row between"><span className="mut">Last check-in</span><b>{info.last}</b></div>
          <div className="row between"><span className="mut">Interval</span><b>{info.interval}</b></div>
          <div className="row between"><span className="mut">Owner</span><span className="mono">{info.owner.slice(0, 8)}…</span></div>
          <button className="btn sm primary" style={{ alignSelf: "flex-start" }} disabled={!isOwner || wrong || busy} onClick={checkIn}>
            {busy ? "Confirm in wallet…" : "Check in (sends a transaction)"}
          </button>
          <span className="s dim">Only the vault owner can check in. Your wallet shows the exact call before signing.</span>
          {tx && <p className="s mono">tx {tx.slice(0, 14)}…</p>}
        </div>
      )}
      {err && <p className="s accent">{err}</p>}
    </div>
  );
}
