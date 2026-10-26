# Brand and renaming

The product name is **not final**. Working name: **Heirloom**. Candidates (Greek/Latin, per the owner): **Hereditas** (Latin, "inheritance"),
**Custos** (Latin, "guardian"), **Paradosis** (Greek, "handing over"). Custos currently fits the AI-agent framing best (a guard that watches over the agent), but nothing is decided.

**Name:** Heirloom
**Tagline:** A dead-man's switch for AI agents and their owners.

(The two lines above are the single docs placeholder: `scripts/rename-product.sh` rewrites them, and all other `.md` files, when you rename.)

## Where the name lives (exactly one file per package)

| Package | File | Holds |
|---|---|---|
| agent (TypeScript) | [`agent/src/brand.ts`](../agent/src/brand.ts) | `BRAND.name`, `slug`, `tagline`. All messages, the CLI, the check-in page and the Claude system prompt read it. |
| web (Next.js) | [`web/lib/brand.ts`](../web/lib/brand.ts) | `BRAND.name`, `slug`, `tagline`, `blurb`. Header, landing, meta tags, localStorage key read it. The synced copies of agent code in `web/lib/agent/` import it from here. |
| contracts (Solidity) | [`contracts/src/Brand.sol`](../contracts/src/Brand.sol) | `Brand.NAME`, `Brand.TAGLINE`, used by the deploy script's logs. |
| docs | this file | name + tagline placeholder above. |

Contract/class identifiers (`Heirloom`, `HeirloomFactory`), env vars (`HEIRLOOM_*`) and package names are code symbols, not copy.

## Renaming

```bash
bash scripts/rename-product.sh Custos                           # dry run: lists what would change
bash scripts/rename-product.sh Custos --apply                   # the 3 brand files + every *.md / .env.example (prose only)
bash scripts/rename-product.sh Custos --apply --identifiers     # + contract/file/class names, package names, HEIRLOOM_* env vars
bash scripts/test-all.sh                                         # always re-run afterwards
```

The `--identifiers` mode was tested on a throw-away copy: after renaming to `Custos`, `forge test` (158), the agent suite (60) and the web suite (18) all passed unchanged.
Still manual after a rename: the git history/remote (none exists), domain names, logo, and the screenshots (`node web/scripts/shots.mjs`).
