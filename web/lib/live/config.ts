import dep from "./deployment.json";
import { defineChain } from "viem";

export const DEPLOY = dep as {
  network: string; chainId: number; rpc: string; explorer: string; factory: `0x${string}`; factoryBlock: number; demoVault: `0x${string}`; demoVaultBlock: number;
  deployer: `0x${string}`; agent: `0x${string}`; demoRecipients: Record<string, `0x${string}`>; demoGuardians: `0x${string}`[]; demoBeneficiary: `0x${string}`; setupTxs: Record<string, string>; note: string;
};
export const chain = defineChain({
  id: DEPLOY.chainId, name: DEPLOY.network, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [DEPLOY.rpc] } }, blockExplorers: { default: { name: "Blockscout", url: DEPLOY.explorer } }, testnet: true,
});
export const txUrl = (h: string) => `${DEPLOY.explorer}/tx/${h}`;
export const addrUrl = (a: string) => `${DEPLOY.explorer}/address/${a}`;
export const ZERO = "0x0000000000000000000000000000000000000000" as const;
/** Demo prices: testnet ETH has no value. The live firewall measures limits in ETH itself (price 1, unit "ETH"). */
export const LIVE_UNIT = "ETH";
/** A made-up attacker address for the demo "prompt injection" test; also on the demo known-bad list. */
export const ATTACKER = "0xbad0c0ffee000000000000000000000000d1ce55" as const;
