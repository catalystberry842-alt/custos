/**
 * brand.ts — the ONE place for the product name and tagline in the web app.
 * Final name: Custos (Latin for "guardian").
 * To rename everything at once: `bash scripts/rename-product.sh <NewName>` from the repo root.
 */
export const BRAND = {
  name: "Custos",
  /** lowercase, url/file-safe (used for the localStorage key) */
  slug: "custos",
  tagline: "A guardian for your AI agent.",
  /** one plain sentence for meta description / hero */
  blurb: "A dead-man's switch for AI agents and their owners: give your agent a wallet with hard limits. If you go silent, it freezes, and people you trust decide what happens next.",
} as const;
