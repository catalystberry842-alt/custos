// AUTO-COPIED from firewall/src/vault.ts by scripts/sync-firewall.sh — do not edit here.
/** Knowledge about the Custos vault used by the live (on-chain) firewall. Selectors/topics were generated with `cast sig`. */
export const CUSTOS_ERRORS: Record<string, { name: string; text: string }> = {
  "0x0d9ab13f": { name: "NotAgent", text: "the caller is not the vault's agent key" },
  "0xe06bcc30": { name: "AgentIsFrozen", text: "the agent is frozen on-chain (kill switch, overdue owner or challenge window)" },
  "0x2611416a": { name: "NoAgent", text: "the vault has no agent set" },
  "0x48472343": { name: "AssetNotAllowed", text: "the vault has no spending limit for this asset" },
  "0x4ccc1eec": { name: "RecipientNotAllowed", text: "the recipient is not on the vault's on-chain allowlist" },
  "0x337434f4": { name: "OverPerTxLimit", text: "the amount is over the vault's on-chain per-transaction cap" },
  "0xc4ef31b7": { name: "OverCallQuota", text: "the vault's on-chain call quota for this window is used up" },
  "0xc7164a10": { name: "OverPeriodLimit", text: "the amount would pass the vault's on-chain per-period cap" },
  "0x1578538d": { name: "Finished", text: "the vault is released or closed" },
  "0xa5d67ef2": { name: "TransferFailedErr", text: "the payment transfer itself failed" },
  "0xab143c06": { name: "Reentrancy", text: "reentrancy guard" },
};
export const TOPICS = {
  Transfer: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  Approval: "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925",
  AgentSpent: "0x350c27ac87ef019173063bef427ab72afff25e55aa1b294166ee9d06b5f1a029",
} as const;
/** eth_simulateV1 with traceTransfers reports native ETH movements as Transfer logs from this pseudo-address. */
export const NATIVE_TRANSFER_LOGGER = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
