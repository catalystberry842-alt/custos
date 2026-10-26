/**
 * brand.ts — the ONE place for the product name and tagline in the web app.
 * Working name only; candidates: Hereditas, Custos, Paradosis (see docs/BRAND.md).
 * To rename everything at once: `bash scripts/rename-product.sh <NewName>` from the repo root.
 */
export const BRAND = {
  name: "Heirloom",
  /** lowercase, url/file-safe (used for the localStorage key) */
  slug: "heirloom",
  tagline: "A dead-man's switch for AI agents and their owners.",
  /** one plain sentence for meta description / hero */
  blurb: "Give your AI agent a wallet with hard limits. If you go silent, it freezes, and people you trust decide what happens next.",
  candidates: ["Hereditas", "Custos", "Paradosis"],
} as const;
