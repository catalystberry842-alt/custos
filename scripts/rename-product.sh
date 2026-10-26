#!/usr/bin/env bash
# Rename the product in one go. LOCAL ONLY: edits files in this repo, nothing else.
#
#   bash scripts/rename-product.sh <NewName>                       dry run: shows what would change
#   bash scripts/rename-product.sh <NewName> --apply               brand files + all docs (*.md, .env.example)
#   bash scripts/rename-product.sh <NewName> --apply --identifiers also code symbols: contract/file/class names,
#                                                                  package names, env vars (HEIRLOOM_* → NEWNAME_*)
#
# "Brand files" (each package has exactly one; they hold name + tagline):
#   agent/src/brand.ts   web/lib/brand.ts   contracts/src/Brand.sol   docs/BRAND.md
# Candidates: Hereditas, Custos, Paradosis.   Tip: after --identifiers run `bash scripts/test-all.sh`.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
new="${1:-}"; shift || true
apply=0; ident=0
for a in "$@"; do case "$a" in --apply) apply=1;; --identifiers) ident=1;; *) echo "unknown flag $a" >&2; exit 2;; esac; done
[[ "$new" =~ ^[A-Z][A-Za-z0-9]{2,23}$ ]] || { echo "usage: $0 <NewName> [--apply] [--identifiers]   (NewName: Capitalised, letters/digits, 3-24 chars)" >&2; exit 2; }
old="$(sed -nE 's/.*name: "([A-Za-z0-9]+)".*/\1/p' "$root/agent/src/brand.ts" | head -1)"
[[ -n "$old" ]] || { echo "could not read the current name from agent/src/brand.ts" >&2; exit 1; }
[[ "$old" != "$new" ]] || { echo "already named $new"; exit 0; }
oldl="$(tr '[:upper:]' '[:lower:]' <<<"$old")"; newl="$(tr '[:upper:]' '[:lower:]' <<<"$new")"
oldu="$(tr '[:lower:]' '[:upper:]' <<<"$old")"; newu="$(tr '[:lower:]' '[:upper:]' <<<"$new")"
echo "rename: $old → $new   (slug $oldl → $newl)   mode: $([[ $apply == 1 ]] && echo APPLY || echo dry-run)$([[ $ident == 1 ]] && echo " + identifiers")"

excl=(-not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/out/*" -not -path "*/cache/*" -not -path "*/.next/*" -not -path "*/broadcast/*" -not -path "*/shots/*" -not -path "*/web/lib/agent/*" -not -name "package-lock.json" -not -name "*.tsbuildinfo")
if [[ $ident == 1 ]]; then
  mapfile -t files < <(cd "$root" && find . -type f "${excl[@]}" \( -name "*.sol" -o -name "*.ts" -o -name "*.tsx" -o -name "*.mjs" -o -name "*.sh" -o -name "*.md" -o -name "*.json" -o -name "*.toml" -o -name "*.css" -o -name ".env.example" -o -name ".gitignore" \) | sort)
else
  mapfile -t files < <(cd "$root" && { echo ./agent/src/brand.ts; echo ./web/lib/brand.ts; echo ./contracts/src/Brand.sol; find . -type f "${excl[@]}" \( -name "*.md" -o -name ".env.example" \); } | sort -u)
fi
hits=0
for f in "${files[@]}"; do
  [[ -f "$root/$f" ]] || continue
  [[ "$f" == "./scripts/rename-product.sh" ]] && continue
  n=$(grep -c -E "$old|$oldl|$oldu" "$root/$f" || true)
  [[ "$n" -gt 0 ]] || continue
  hits=$((hits+n)); echo "  $f: $n line(s)"
  if [[ $apply == 1 ]]; then
    if [[ $ident == 1 ]]; then
      sed -i -E "s/$old/$new/g; s/$oldu/$newu/g; s/$oldl/$newl/g" "$root/$f"
    else
      case "$f" in
        ./agent/src/brand.ts|./web/lib/brand.ts|./contracts/src/Brand.sol) sed -i -E "s/$old/$new/g; s/$oldl/$newl/g" "$root/$f" ;;
        # docs: prose only. Leave code symbols (Heirloom.sol, HeirloomFactory, HeirloomAgent…) for --identifiers
        *) OLD="$old" NEW="$new" perl -pi -e 's/\b$ENV{OLD}\b(?!\.sol|\.t\.sol|Factory|Agent|\()/$ENV{NEW}/g' "$root/$f" ;;
      esac
    fi
  fi
done
if [[ $ident == 1 ]]; then
  while IFS= read -r p; do
    d="$(dirname "$p")"; b="$(basename "$p")"; nb="${b//$old/$new}"
    echo "  rename file: ${p#$root/} → $nb"
    [[ $apply == 1 ]] && mv "$p" "$d/$nb"
  done < <(find "$root" -type f -name "*$old*" -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/out/*" -not -path "*/cache/*" -not -path "*/.next/*" -not -path "*/broadcast/*" -not -path "*/shots/*" | sort)
fi
if [[ $apply == 1 ]]; then
  echo "applied: $hits line(s) updated."
  [[ $ident == 1 ]] && (cd "$root" && bash scripts/sync-model.sh >/dev/null 2>&1 || true)
  echo "next: review 'git diff --stat', run 'bash scripts/test-all.sh', re-take screenshots."
else
  echo "dry run: $hits line(s) would change. Re-run with --apply."
fi
