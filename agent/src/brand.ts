/**
 * brand.ts — the ONE place for the product name and tagline in the agent package.
 * Working name only; candidates: Hereditas, Custos, Paradosis. To rename everything at once use
 * `bash scripts/rename-product.sh <NewName>` from the repo root (it edits this file, web/lib/brand.ts,
 * contracts/src/Brand.sol and docs/BRAND.md, and with --identifiers also the code symbols).
 */
export const BRAND = {
  name: "Heirloom",
  /** lowercase, url/file-safe */
  slug: "heirloom",
  tagline: "A dead-man's switch for AI agents and their owners.",
  /** one plain sentence (web meta description / hero) */
  blurb: "Give your AI agent a wallet with hard limits. If you go silent, it freezes, and people you trust decide what happens next.",
  candidates: ["Hereditas", "Custos", "Paradosis"],
} as const;
