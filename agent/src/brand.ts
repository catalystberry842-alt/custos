/**
 * brand.ts — the ONE place for the product name and tagline in the agent package.
 * Final name: Custos (Latin for "guardian").
 * `bash scripts/rename-product.sh <NewName>` from the repo root (it edits this file, web/lib/brand.ts,
 * contracts/src/Brand.sol and docs/BRAND.md, and with --identifiers also the code symbols).
 */
export const BRAND = {
  name: "Custos",
  /** lowercase, url/file-safe */
  slug: "custos",
  tagline: "A guardian for your AI agent.",
  /** one plain sentence (web meta description / hero) */
  blurb: "A dead-man's switch for AI agents and their owners: give your agent a wallet with hard limits. If you go silent, it freezes, and people you trust decide what happens next.",
} as const;
