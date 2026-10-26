// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// ONE place for the product name/tagline in the contracts package (used by the deploy script's logs).
/// Contract identifiers (`Custos`, `CustosFactory`) are code symbols: `scripts/rename-product.sh --identifiers` renames them.
library Brand {
    string internal constant NAME = "Custos";
    string internal constant TAGLINE = "A guardian for your AI agent.";
}
