import { canonical, sha256Hex } from "./sha256.js";
import type { ExecResult, RuleResult, Verdict } from "./types.js";

export const GENESIS = "0".repeat(64);
export type AuditType = "register" | "policy" | "decision" | "resolution" | "result" | "control";

export interface AuditEntry {
  index: number;
  ts: number;
  type: AuditType;
  agentId: string;
  agentName: string;
  summary: string;
  /** hash of the policy that was in force when this entry was written */
  policyHash?: string;
  action?: { nonce: number; to: string; fn: string; asset?: string; recipient?: string; spender?: string; usd?: number; intent?: string };
  rules?: { rule: string; ok: boolean; severity: string; detail: string }[];
  decision?: Verdict;
  reasons?: string[];
  /** index of the entry this one refers to (result → decision, resolution → decision) */
  ref?: number;
  actor?: string;
  result?: ExecResult;
  prevHash: string;
  hash: string;
}

export type NewEntry = Omit<AuditEntry, "index" | "prevHash" | "hash">;
export const slimRules = (r: RuleResult[]) => r.map((x) => ({ rule: x.rule, ok: x.ok, severity: x.severity, detail: x.detail }));

export function hashEntry(e: Omit<AuditEntry, "hash">): string {
  return sha256Hex(canonical(e));
}

export interface VerifyResult { ok: boolean; checked: number; brokenAt?: number; reason?: string; head: string }

/**
 * Append-only, hash-chained log: each entry commits to the previous one, so editing, deleting or reordering any entry
 * is detectable. NOTE what this proves: that the firewall recorded these decisions and nobody changed them since.
 * It does NOT prove the agent is honest, or that the decision was correct.
 */
export class AuditLog {
  private _entries: AuditEntry[] = [];
  constructor(entries: AuditEntry[] = []) { this._entries = entries; }
  get entries(): readonly AuditEntry[] { return this._entries; }
  get head(): string { return this._entries.length ? this._entries[this._entries.length - 1]!.hash : GENESIS; }
  append(e: NewEntry): AuditEntry {
    const base = { ...e, index: this._entries.length, prevHash: this.head };
    const entry: AuditEntry = { ...base, hash: hashEntry(base) };
    this._entries.push(entry);
    return entry;
  }
  verify(): VerifyResult { return verifyChain(this._entries); }
}

export function verifyChain(entries: readonly AuditEntry[]): VerifyResult {
  let prev = GENESIS;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    const { hash, ...rest } = e;
    if (e.index !== i) return { ok: false, checked: i, brokenAt: i, reason: `entry ${i} is out of order or missing (found index ${e.index})`, head: prev };
    if (e.prevHash !== prev) return { ok: false, checked: i, brokenAt: i, reason: `entry ${i} does not link to the previous entry`, head: prev };
    if (hashEntry(rest) !== hash) return { ok: false, checked: i, brokenAt: i, reason: `entry ${i} was modified after it was written`, head: prev };
    prev = hash;
  }
  return { ok: true, checked: entries.length, head: prev };
}

/** Build the next entry for an externally held chain (e.g. a stateless firewall API whose client keeps the log). */
export function makeEntry(prev: { index: number; hash: string } | null, e: NewEntry): AuditEntry {
  const base = { ...e, index: prev ? prev.index + 1 : 0, prevHash: prev ? prev.hash : GENESIS };
  return { ...base, hash: hashEntry(base) };
}
