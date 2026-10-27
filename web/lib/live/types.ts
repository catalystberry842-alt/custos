import type { AuditEntry, RuleResult, Verdict } from "../firewall";

export interface LiveTx { to: `0x${string}`; data?: `0x${string}`; value?: bigint }
export interface SubmitBody { vault: `0x${string}`; tx: LiveTx; intent?: string; nonce: number; prevHead: { index: number; hash: string } | null; approval?: { signature: `0x${string}` } }
export interface SignedEntry { entry: AuditEntry; sig: `0x${string}` }
export interface SubmitResult {
  verdict: Verdict; rules: RuleResult[]; reasons: string[]; fn: string; usd: number;
  executed?: { ok: boolean; txHash?: string; detail: string; block?: number };
  entries: SignedEntry[];
  approvalMessage?: string; // present when verdict is pending: the owner signs this text to approve
  agent: string; simulator: string; simNotes: string[]; nextNonce: number;
}
export const approvalMessage = (vault: string, nonce: number, digest: string) =>
  `Custos firewall approval\nvault: ${vault.toLowerCase()}\nchain: 46630\nnonce: ${nonce}\naction: ${digest}`;
