import { describe, expect, it } from "vitest";
import { createPublicClient, http } from "viem";
import { DEFAULT_NETWORK, NETWORKS, addChainParams, robinhoodChain, robinhoodTestnet, safeRpc } from "../lib/robinhood";
import { readFileSync } from "node:fs";

describe("Robinhood Chain config (docs.robinhood.com/chain/connecting, checked 2026-10-26)", () => {
  it("has the documented chain ids, ETH gas and endpoints", () => {
    expect(robinhoodChain.id).toBe(4663);
    expect(robinhoodTestnet.id).toBe(46630);
    expect(robinhoodChain.nativeCurrency.symbol).toBe("ETH");
    expect(robinhoodTestnet.nativeCurrency.symbol).toBe("ETH");
    expect(robinhoodChain.rpcUrls.default.http[0]).toBe("https://rpc.mainnet.chain.robinhood.com");
    expect(robinhoodTestnet.rpcUrls.default.http[0]).toBe("https://rpc.testnet.chain.robinhood.com");
    expect(robinhoodChain.blockExplorers.default.url).toBe("https://robinhoodchain.blockscout.com");
    expect(robinhoodTestnet.blockExplorers.default.url).toBe("https://explorer.testnet.chain.robinhood.com");
    expect(robinhoodChain.testnet).toBe(false);
    expect(robinhoodTestnet.testnet).toBe(true);
  });
  it("defaults to testnet, never mainnet", () => { expect(DEFAULT_NETWORK).toBe("testnet"); });
  it("builds hex wallet_addEthereumChain params", () => {
    expect(addChainParams("mainnet").chainId).toBe("0x1237");
    expect(addChainParams("testnet").chainId).toBe("0xb626");
    expect(addChainParams("testnet").rpcUrls).toEqual(["https://rpc.testnet.chain.robinhood.com"]);
  });
  it("works as a viem public client config (no network call made)", () => {
    const c = createPublicClient({ chain: NETWORKS.testnet, transport: http(safeRpc("testnet")) });
    expect(c.chain.id).toBe(46630);
  });
  it("only accepts https custom RPC urls", () => {
    expect(safeRpc("mainnet", "https://my.rpc.example/v2/abc")).toBe("https://my.rpc.example/v2/abc");
    expect(safeRpc("mainnet", "http://evil")).toBe(robinhoodChain.rpcUrls.default.http[0]);
    expect(safeRpc("mainnet", "javascript:alert(1)")).toBe(robinhoodChain.rpcUrls.default.http[0]);
    expect(safeRpc("testnet", "not a url")).toBe(robinhoodTestnet.rpcUrls.default.http[0]);
    expect(safeRpc("testnet")).toBe(robinhoodTestnet.rpcUrls.default.http[0]);
  });
  it("web app never converts block numbers to time and has no memecoin/price framing", () => {
    for (const f of ["../lib/robinhood.ts", "../lib/sim.ts"]) {
      const src = readFileSync(new URL(f, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(src).not.toMatch(/blockNumber|getBlockNumber|block\.number/);
    }
    for (const f of ["../app/page.tsx", "../app/layout.tsx", "../app/setup/page.tsx", "../app/dashboard/page.tsx"]) {
      const src = readFileSync(new URL(f, import.meta.url), "utf8");
      expect(src).not.toMatch(/memecoin|to the moon|100x|airdrop|price target|monad/i);
    }
  });
});
