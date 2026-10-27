// AUTO-COPIED from firewall/src/calldata.ts by scripts/sync-firewall.sh — do not edit here.
import type { Decoded, RawAction } from "./types";

/** Largest value we still call "unlimited" (2^128). Real "max" approvals are 2^256-1 or 2^160-1 (Permit2). */
export const UNLIMITED = 1n << 128n;
export const MAX_UINT256 = (1n << 256n) - 1n;

const SEL = {
  transfer: "0xa9059cbb",
  transferFrom: "0x23b872dd",
  approve: "0x095ea7b3",
  increaseAllowance: "0x39509351",
  setApprovalForAll: "0xa22cb465",
  permit: "0xd505accf",
  /** Custos vault: agentSpend(address asset, address to, uint256 amount); asset 0x0 = ETH */
  agentSpend: "0xb45d3594",
} as const;

const strip = (h: string) => (h.startsWith("0x") ? h.slice(2) : h);
const word = (data: string, i: number): string => strip(data).slice(8 + i * 64, 8 + (i + 1) * 64);
const addrAt = (data: string, i: number) => "0x" + word(data, i).slice(24).toLowerCase();
const numAt = (data: string, i: number) => BigInt("0x" + (word(data, i) || "0"));

export const lc = (a: string) => a.toLowerCase();

/** Classify what a raw transaction really does, from calldata, NOT from anything the agent claims about it. */
export function decode(a: Pick<RawAction, "to" | "value" | "data">, extraSelectors: Record<string, string> = {}): Decoded {
  const target = lc(a.to);
  const data = a.data && a.data !== "0x" ? lc(a.data) : "";
  if (!data) return { kind: "native_transfer", fn: "native_transfer", target, asset: "native", recipient: target, amountRaw: a.value ?? 0n };
  const selector = data.slice(0, 10);
  const need = (n: number) => strip(data).length >= 8 + n * 64;
  const base = { target, selector, asset: target };
  switch (selector) {
    case SEL.transfer:
      return need(2) ? { ...base, kind: "erc20_transfer", fn: "transfer", recipient: addrAt(data, 0), amountRaw: numAt(data, 1) } : malformed(target, selector);
    case SEL.transferFrom:
      return need(3) ? { ...base, kind: "erc20_transferFrom", fn: "transferFrom", recipient: addrAt(data, 1), amountRaw: numAt(data, 2) } : malformed(target, selector);
    case SEL.agentSpend: {
      if (!need(3)) return malformed(target, selector);
      const token = addrAt(data, 0);
      const native = token === "0x0000000000000000000000000000000000000000";
      return { kind: native ? "native_transfer" : "erc20_transfer", fn: "agentSpend", target, selector, asset: native ? "native" : token, recipient: addrAt(data, 1), amountRaw: numAt(data, 2) };
    }
    case SEL.approve:
    case SEL.increaseAllowance: {
      if (!need(2)) return malformed(target, selector);
      const amountRaw = numAt(data, 1);
      return { ...base, kind: "approve", fn: selector === SEL.approve ? "approve" : "increaseAllowance", spender: addrAt(data, 0), amountRaw, unlimited: amountRaw >= UNLIMITED };
    }
    case SEL.setApprovalForAll: {
      if (!need(2)) return malformed(target, selector);
      const on = numAt(data, 1) !== 0n;
      return { ...base, kind: "setApprovalForAll", fn: "setApprovalForAll", spender: addrAt(data, 0), unlimited: on, amountRaw: on ? MAX_UINT256 : 0n };
    }
    case SEL.permit: {
      if (!need(7)) return malformed(target, selector);
      const amountRaw = numAt(data, 2);
      return { ...base, kind: "permit", fn: "permit", spender: addrAt(data, 1), amountRaw, unlimited: amountRaw >= UNLIMITED };
    }
    default: {
      const fn = extraSelectors[selector];
      return { kind: "contract_call", fn: fn ?? `unknown(${selector})`, target, selector, asset: target, knownFn: !!fn, amountRaw: a.value ?? 0n };
    }
  }
}
const malformed = (target: string, selector: string): Decoded => ({ kind: "contract_call", fn: `malformed(${selector})`, target, selector, asset: target, knownFn: false, amountRaw: 0n });

// ── tiny encoders so tests, the demo and agents can build real calldata without a library ──
const pad = (hex: string) => hex.replace(/^0x/, "").padStart(64, "0");
const enc = (selector: string, ...words: string[]) => selector + words.map(pad).join("");
const addrWord = (a: string) => pad(lc(a));
const numWord = (n: bigint) => pad(n.toString(16));
export const encodeTransfer = (to: string, amount: bigint) => enc(SEL.transfer, addrWord(to), numWord(amount));
export const encodeTransferFrom = (from: string, to: string, amount: bigint) => enc(SEL.transferFrom, addrWord(from), addrWord(to), numWord(amount));
export const encodeApprove = (spender: string, amount: bigint) => enc(SEL.approve, addrWord(spender), numWord(amount));
export const encodeSetApprovalForAll = (operator: string, approved: boolean) => enc(SEL.setApprovalForAll, addrWord(operator), numWord(approved ? 1n : 0n));
export const encodePermit = (owner: string, spender: string, value: bigint, deadline: bigint) =>
  enc(SEL.permit, addrWord(owner), addrWord(spender), numWord(value), numWord(deadline), numWord(27n), pad("0"), pad("0"));
export const encodeAgentSpend = (asset: string, to: string, amount: bigint) => enc(SEL.agentSpend, addrWord(asset), addrWord(to), numWord(amount));
export const encodeCall = (selector: string, ...args: bigint[]) => enc(selector, ...args.map(numWord));
