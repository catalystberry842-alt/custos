export type Verdict = "approve" | "block" | "pending";
export type DecodedKind = "native_transfer" | "erc20_transfer" | "erc20_transferFrom" | "approve" | "setApprovalForAll" | "permit" | "contract_call";

/** What an agent proposes: the raw transaction a signer would otherwise just sign. `intent` is free text and is NEVER trusted. */
export interface RawAction {
  agentId: string;
  /** strictly increasing per agent; reuse = replay */
  nonce: number;
  /** ms since epoch (simulation clock in demos) */
  ts: number;
  chainId: number;
  to: string;
  value?: bigint;
  data?: string;
  intent?: string;
}

export interface Decoded {
  kind: DecodedKind;
  fn: string;
  target: string;
  selector?: string;
  /** token contract address, or "native" */
  asset?: string;
  recipient?: string;
  spender?: string;
  amountRaw?: bigint;
  unlimited?: boolean;
  knownFn?: boolean;
}

export interface AssetInfo { symbol: string; decimals: number; usd: number }

export interface AgentPolicy {
  chainId: number;
  /** allowlisted assets (lowercase token address, or "native") with decimals and a USD price used for limits */
  assets: Record<string, AssetInfo>;
  /** allowed target contracts besides the allowlisted token contracts */
  contracts: string[];
  /** allowed function names ("transfer", "native_transfer", "swapExactTokensForTokens", …) */
  functions: string[];
  /** destination allowlist for transfers (empty = nobody) */
  recipients: string[];
  /** bounded approvals are only allowed towards these spenders; others go to a human */
  spenders: string[];
  perTxUsd: number;
  dailyUsd: number;
  cumulativeUsd: number;
  quota: { maxTx: number; windowMs: number };
  /** amounts above this need a human even when inside every limit (optional) */
  humanApprovalAboveUsd?: number;
  /** what to do with a contract that is not allowlisted */
  unknownContract: "pending" | "block";
  /** auto-freeze the agent after this many blocked actions inside the window (runaway/attack circuit breaker) */
  breaker?: { blocks: number; windowMs: number };
}

export type Severity = "block" | "pending" | "info";
export interface RuleResult { rule: string; label: string; ok: boolean; severity: Severity; detail: string }

export interface Decision {
  verdict: Verdict;
  agentId: string;
  auditIndex: number;
  rules: RuleResult[];
  /** the failing rules, as plain sentences */
  reasons: string[];
  decoded?: Decoded;
  usd?: number;
  pendingId?: number;
}

export interface Pending {
  id: number;
  auditIndex: number;
  action: RawAction;
  decoded: Decoded;
  rules: RuleResult[];
  reasons: string[];
  usd: number;
  status: "open" | "approved" | "denied";
}

export interface ExecResult { ok: boolean; detail: string; txHash?: string }
