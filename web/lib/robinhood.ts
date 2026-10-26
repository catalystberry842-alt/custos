/**
 * Robinhood Chain (Arbitrum Orbit L2, ETH gas) chain definitions for viem. Config only: no keys, no deploys.
 * Source: https://docs.robinhood.com/chain/connecting/  (checked 2026-10-26)
 *
 * Public RPCs are rate-limited and "not recommended for production" per the docs. Providers (Alchemy etc.) need an
 * API key which must never be committed; users can paste their own RPC URL in the panel instead.
 *
 * NOTE for contract logic: on Robinhood Chain `block.number` is an L1-block-number ESTIMATE. Custos only uses
 * `block.timestamp`, so nothing in this app converts block numbers to time.
 */
import { defineChain } from "viem";

export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"], webSocket: ["wss://feed.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com", apiUrl: "https://robinhoodchain.blockscout.com/api" } },
  testnet: false,
});

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com"], webSocket: ["wss://feed.testnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://explorer.testnet.chain.robinhood.com", apiUrl: "https://explorer.testnet.chain.robinhood.com/api" } },
  testnet: true,
});

export type RobinhoodNetwork = "testnet" | "mainnet";
export const NETWORKS = { testnet: robinhoodTestnet, mainnet: robinhoodChain } as const;
export const DEFAULT_NETWORK: RobinhoodNetwork = "testnet";

/** wallet_addEthereumChain payload (hex chain id) for an injected wallet. */
export function addChainParams(n: RobinhoodNetwork) {
  const c = NETWORKS[n];
  return {
    chainId: `0x${c.id.toString(16)}`,
    chainName: c.name,
    nativeCurrency: c.nativeCurrency,
    rpcUrls: [...c.rpcUrls.default.http],
    blockExplorerUrls: [c.blockExplorers.default.url],
  };
}

/** Only accept https RPC URLs a user pasted (or the default). Never ws/http/file/js. */
export function safeRpc(n: RobinhoodNetwork, custom?: string): string {
  const fallback = NETWORKS[n].rpcUrls.default.http[0];
  if (!custom) return fallback;
  try { const u = new URL(custom); return u.protocol === "https:" ? u.toString() : fallback; } catch { return fallback; }
}
