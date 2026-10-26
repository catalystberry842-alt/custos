# Heirloom contracts

Foundry project (solc 0.8.26, EVM `cancun`, optimizer 200). Designed for Robinhood Chain (Arbitrum Orbit L2). **Unaudited, never deployed.**

```bash
forge build
forge test                         # 80 tests: unit, scenario, fuzz, reentrancy, hostile tokens, Robinhood-chain timing
forge coverage --report summary
```

* `src/Heirloom.sol` per-owner vault; `src/HeirloomFactory.sol`; `src/interfaces/`.
* **Time = `block.timestamp` only.** `block.number` is an L1-block estimate on Robinhood Chain; `test/RobinhoodChain.t.sol` proves that
  huge/backwards/frozen block numbers never move a deadline and greps `src/` for forbidden globals.
* `script/Deploy.s.sol` local anvil only. `script/DeployRobinhood.s.sol` chain-guarded (46630 / 4663 / local), mainnet needs `HEIRLOOM_MAINNET_OK=yes`.
  The signer comes only from the forge CLI (`--account <keystore>` / `--ledger`); no key is read from env or files. Omit `--broadcast` to simulate.
* `foundry.toml` has `robinhood_testnet` / `robinhood_mainnet` RPC endpoints and Blockscout explorer entries (no keys).
  Full steps, checklist and verification: [`../docs/DEPLOY-ROBINHOOD.md`](../docs/DEPLOY-ROBINHOOD.md).
