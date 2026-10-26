# Custos contracts

Foundry project (solc 0.8.26, EVM `cancun`, optimizer 200, `via_ir` so the factory fits under 24 KB). Designed for Robinhood Chain (Arbitrum Orbit L2). **Unaudited, never deployed.**

```bash
forge build
forge test                         # 158 tests: unit, scenario, fuzz, reentrancy, hostile tokens, AI-agent layer, Robinhood-chain timing
forge coverage --report summary
```

* `src/Custos.sol` per-owner vault; `src/CustosFactory.sol`; `src/interfaces/`.
* **Time = `block.timestamp` only.** `block.number` is an L1-block estimate on Robinhood Chain; `test/RobinhoodChain.t.sol` proves that
  huge/backwards/frozen block numbers never move a deadline and greps `src/` for forbidden globals.
* `script/Deploy.s.sol` local anvil only. `script/DeployRobinhood.s.sol` chain-guarded (46630 / 4663 / local), mainnet needs `CUSTOS_MAINNET_OK=yes`.
  The signer comes only from the forge CLI (`--account <keystore>` / `--ledger`); no key is read from env or files. Omit `--broadcast` to simulate.
* `foundry.toml` has `robinhood_testnet` / `robinhood_mainnet` RPC endpoints and Blockscout explorer entries (no keys).
  Full steps, checklist and verification: [`../docs/DEPLOY-ROBINHOOD.md`](../docs/DEPLOY-ROBINHOOD.md).

## AI-agent layer (in `Custos.sol`)
`setAgent(agent, period, lateAllowance)`, `setAssetLimit(asset, perTx, perPeriod)`, `setRecipient(to, allowed)`, `setSuccessor`, `freezeAgent/unfreezeAgent`, `revokeAgent` (owner);
`agentSpend(asset, to, amount)` (agent key only); `guardianFreezeAgent()` and `approveOutcome(Handover|Release)` (guardians); `executeRelease()` runs the winning outcome; views `agentState()`, `agentCutoff()`, `agentAllowance(asset)`.
Tests: `test/CustosAgent.t.sol` (config, spend limits, freeze sources, compromised key, handover, reentrancy/hostile tokens, fuzz). Product name lives in `src/Brand.sol` (see `../docs/BRAND.md`).
