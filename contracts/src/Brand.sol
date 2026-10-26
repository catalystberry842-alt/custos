// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// ONE place for the product name/tagline in the contracts package (used by the deploy script's logs).
/// Contract identifiers (`Heirloom`, `HeirloomFactory`) are code symbols: `scripts/rename-product.sh --identifiers` renames them.
library Brand {
    string internal constant NAME = "Heirloom"; // working name; candidates: Hereditas, Custos, Paradosis
    string internal constant TAGLINE = "A dead-man's switch for AI agents and their owners.";
}
