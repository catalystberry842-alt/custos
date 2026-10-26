import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

// Robinhood Chain: block.number is an L1-block estimate. The agent must derive all timing from timestamps only.
describe("agent never uses block numbers for timing (Robinhood Chain)", () => {
  const dir = new URL("../src/", import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
    it(`${f} has no block-number reads`, () => {
      const src = readFileSync(new URL(f, dir), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(src).not.toMatch(/getBlockNumber|blockNumber|getBlock\(|block\.number|fromBlock/);
    });
  }
});
