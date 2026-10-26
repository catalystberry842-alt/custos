# Brand and renaming

**Name:** Custos
**Tagline:** A guardian for your AI agent.

*Custos* is Latin for "guardian": the contract guards the agent's budget, and the guardians you choose guard the agent when you cannot.
Descriptor used in body copy: "a dead-man's switch for AI agents and their owners".

(The two bold lines above are the single docs placeholder: `scripts/rename-product.sh` rewrites them, and all other `.md` files, when you rename.)

## Where the name lives (exactly one file per package)

| Package | File | Holds |
|---|---|---|
| agent (TypeScript) | [`agent/src/brand.ts`](../agent/src/brand.ts) | `BRAND.name`, `slug`, `tagline`, `blurb`. All messages, the CLI, the check-in page and the Claude system prompt read it. |
| web (Next.js) | [`web/lib/brand.ts`](../web/lib/brand.ts) | Same fields. Header, landing, meta tags and the localStorage key read it. The synced copies of agent code in `web/lib/agent/` import it from here. |
| contracts (Solidity) | [`contracts/src/Brand.sol`](../contracts/src/Brand.sol) | `Brand.NAME`, `Brand.TAGLINE`, used by the deploy script's logs. |
| docs | this file | name + tagline placeholder above. |

Contract/class identifiers (`Custos`, `CustosFactory`), env vars (`CUSTOS_*`) and package names are code symbols, not copy. The tagline is not touched by the rename script: edit it in the three brand files and here.

## Renaming again (if ever)

```bash
bash scripts/rename-product.sh <NewName>                           # dry run: lists what would change
bash scripts/rename-product.sh <NewName> --apply                   # the 3 brand files + every *.md / .env.example (prose only)
bash scripts/rename-product.sh <NewName> --apply --identifiers     # + contract/file/class names, package names, CUSTOS_* env vars
bash scripts/test-all.sh                                           # always re-run afterwards
```

`--identifiers` was tested on a throw-away copy and then applied to this repo (forge, agent and web suites unchanged).
Still manual after a rename: lock-file package names, the tagline, domain names, logo and screenshots (`node web/scripts/shots.mjs`).
