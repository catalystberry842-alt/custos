# Live on Robinhood Chain testnet (chain 46630)

Everything on this page is real and checkable on the [Robinhood Chain Testnet explorer](https://explorer.testnet.chain.robinhood.com). Test ETH only. No mainnet deployment, no token.

## Contracts

| What | Address |
|---|---|
| CustosFactory (Blockscout-verified) | [`0xe7793b7c612dd9174134ba5ebf28b0d743c1ef38`](https://explorer.testnet.chain.robinhood.com/address/0xe7793b7c612dd9174134ba5ebf28b0d743c1ef38) |
| Demo vault (owner = deployer) | [`0x7Cd7D6b00023B298EB869E3201af077daC71955C`](https://explorer.testnet.chain.robinhood.com/address/0x7Cd7D6b00023B298EB869E3201af077daC71955C) |
| Demo agent (throwaway testnet key) | [`0x78141a8F7c99ee9bbb3148096F4add6Fed925888`](https://explorer.testnet.chain.robinhood.com/address/0x78141a8F7c99ee9bbb3148096F4add6Fed925888) |
| Deployer / demo vault owner | [`0xBD6518c9fD975304f0858d7378364Ad240192a1a`](https://explorer.testnet.chain.robinhood.com/address/0xBD6518c9fD975304f0858d7378364Ad240192a1a) |
| Second vault created through the UI by a fresh wallet | [`0x49E15690478D05a25F7d4833e1bf44Db94E61677`](https://explorer.testnet.chain.robinhood.com/address/0x49E15690478D05a25F7d4833e1bf44Db94E61677) |

RPC `https://rpc.testnet.chain.robinhood.com`. Factory deployed in block 143747383.

## Transactions

### Deployment and demo vault setup
| Step | Sent by | Tx |
|---|---|---|
| Deploy CustosFactory | deployer | [`0xda3edb6d…afb4d5`](https://explorer.testnet.chain.robinhood.com/tx/0xda3edb6d333205a372cddec0531e2878cc646fcd4864649f7a6f009666afb4d5) |
| Create demo vault (factory.create) | deployer | [`0xeaa65847…88b9c0`](https://explorer.testnet.chain.robinhood.com/tx/0xeaa65847914409b7bd4d4020052020d59d1f8ec28ec8a8d7e311fafcb788b9c0) |
| Authorise agent | deployer | [`0x8cd31e66…652aa1`](https://explorer.testnet.chain.robinhood.com/tx/0x8cd31e6641da59d24bc49c32f2de7b09c4028107fe1ddc6d9567540aff652aa1) |
| ETH limits 0.0005 per payment / 0.002 per period | deployer | [`0xae7f8b19…46fe16`](https://explorer.testnet.chain.robinhood.com/tx/0xae7f8b19bc3465624b848267cc5ac14674e689cace5663d013649aedef46fe16) |
| Allow Acme Ltd | deployer | [`0x3c5fb8ed…009f3b`](https://explorer.testnet.chain.robinhood.com/tx/0x3c5fb8edd4776ae8f834a8071fed38a1007376dd438eba2802d56fded5009f3b) |
| Allow Landlord | deployer | [`0x4d08f28f…ef42c6`](https://explorer.testnet.chain.robinhood.com/tx/0x4d08f28f33f7e533e7d6ff346c3049f6900fd4e7f9172fa34eba93e078ef42c6) |
| Call quota 5 | deployer | [`0x8c487068…73a0c2`](https://explorer.testnet.chain.robinhood.com/tx/0x8c48706812df9362c6bff54849e6cc0dc95f35d5d3150e2813bf86a88473a0c2) |
| Deposit 0.004 ETH | deployer | [`0xa9f5bb09…de2fa8`](https://explorer.testnet.chain.robinhood.com/tx/0xa9f5bb0906c0f62ef7c7e92320d9f149ddac9213d303323202c0ffdc7dde2fa8) |
| Fund agent gas 0.002 ETH | deployer | [`0xce5369bc…d06f1f`](https://explorer.testnet.chain.robinhood.com/tx/0xce5369bc35ff47b9b24acec7c1a6e4f1c27c2c422180b5b65d3d712f9cd06f1f) |
| Timings: check in every 90 days | deployer | [`0x968d3255…6a4525`](https://explorer.testnet.chain.robinhood.com/tx/0x968d3255f79bc13e34527061b9f283c4a7ee4c4f95ac8bed38fd26dae26a4525) |

### Live app end-to-end run on the demo vault (scripted injected wallet)
| Step | Sent by | Tx |
|---|---|---|
| agentSpend 0.0002 ETH to Acme, approved by the firewall | agent key | [`0x2695193f…63de14`](https://explorer.testnet.chain.robinhood.com/tx/0x2695193f25e083dfb7eaa9fa1150896fe31d569fb1136640ca00a9d68f63de14) |
| agentSpend 0.0004 ETH to Landlord, owner-approved with a signature | agent key | [`0xfb619ac5…e5d4fe`](https://explorer.testnet.chain.robinhood.com/tx/0xfb619ac5d55b4990cf8987b30ae43bf6b8af31cade9102a18c0435457fe5d4fe) |
| Kill switch (freezeAgent) | owner | [`0xac256550…600064`](https://explorer.testnet.chain.robinhood.com/tx/0xac2565509853a533d463c620fabc28e53b41b6f9d062d6ee960ccb4627600064) |
| Unfreeze agent | owner | [`0xe8d70dc9…826030`](https://explorer.testnet.chain.robinhood.com/tx/0xe8d70dc9d00e3392f694bcdbfd499083a0dff51c13c35ce387ce101fcb826030) |
| Check in | owner | [`0xdd214f45…c55181`](https://explorer.testnet.chain.robinhood.com/tx/0xdd214f456eec0956c5caa062818c5528ee7769f0429197671e26a98acec55181) |
| Funding the test wallet | deployer | [`0x9363dfcc…99b592`](https://explorer.testnet.chain.robinhood.com/tx/0x9363dfccb6b537d0d975c097bf901aa4bbfc5dd8d131218eff60c0d79c99b592) |
| Owner check-in (demo vault) | deployer | [`0x150e7bb4…eda546`](https://explorer.testnet.chain.robinhood.com/tx/0x150e7bb4ff2e0c03fe2aaf4b5aecfe8a08162660f55b9e720d7e429e04eda546) |
| First firewall-approved agentSpend 0.0002 ETH to Acme (curl against the API) | agent key | [`0x0e9c7e59…91c41b`](https://explorer.testnet.chain.robinhood.com/tx/0x0e9c7e590e6d472eda86cdc7bba8c4798332bf70fc5a43d21332bf944191c41b) |

### A fresh wallet creates its own vault through the UI (7 wallet transactions) and the agent pays
| Step | Sent by | Tx |
|---|---|---|
| Create vault (factory.create) | tester wallet | [`0xcdd74919…f61039`](https://explorer.testnet.chain.robinhood.com/tx/0xcdd74919430e6c3be8862dc5cb1626adb9afc937725a0e7c4ac59bf88af61039) |
| Authorise agent | tester wallet | [`0x2f8a50ac…c29e2c`](https://explorer.testnet.chain.robinhood.com/tx/0x2f8a50ac42888a02142535ec5cffdd02bd38b854fc01d13b948c98ebc4c29e2c) |
| ETH limits | tester wallet | [`0x626458d3…661ba8`](https://explorer.testnet.chain.robinhood.com/tx/0x626458d3dcea7564a0016b4e6d556613b3d6e538dca331259beca2c57f661ba8) |
| Allow Acme | tester wallet | [`0x38d6ce4a…149d91`](https://explorer.testnet.chain.robinhood.com/tx/0x38d6ce4a10199d0a84e0ebb81b42f3abf6380753be15ecaf0d283672af149d91) |
| Allow Landlord | tester wallet | [`0x83ba604f…9addb6`](https://explorer.testnet.chain.robinhood.com/tx/0x83ba604f2321e000e03c23c426f58a3a0c536ff412f083678b28bf95a49addb6) |
| Call quota 5 | tester wallet | [`0x51086a07…926cfa`](https://explorer.testnet.chain.robinhood.com/tx/0x51086a070b089ed747223e726452b0a13bca93d26dd6a3b14b84718c5e926cfa) |
| Deposit 0.0008 ETH | tester wallet | [`0x209ce9d3…ed5593`](https://explorer.testnet.chain.robinhood.com/tx/0x209ce9d368c340224f4b1e0469efea1d5110afab727b2f9a806121d2f6ed5593) |
| agentSpend 0.0002 ETH to Acme, approved by the firewall | agent key | [`0x04eccaff…ccd13c`](https://explorer.testnet.chain.robinhood.com/tx/0x04eccaffe325d4a60eb4a12144ef2897692848ef469b456a02887541bbccd13c) |

## What is on-chain and what is not

On-chain and real:
- The factory and vault contracts, and every setting, deposit, check-in, freeze and payment above.
- The per-payment cap, period cap, payee allowlist, call quota and freeze. The contract enforces them whatever the website or firewall do.
- The activity feed in `/live`, read straight from the vault's event logs (no indexer, no database).

Off-chain, run by us:
- The firewall rules, the owner-approval prompt and the audit trail run in a Next.js API route. They add checks (threat list, replay guard, human approval), but they are not a contract.
- Simulation is a real `eth_simulateV1` call (with `traceTransfers`) to the testnet node, against the latest state.
- The demo agent key is a shared throwaway testnet key stored as a Vercel sensitive environment variable. It signs only `vault.agentSpend`, only after the firewall approved the action.
- Firewall-only parameters are derived defaults: ask-the-owner above 60% of the per-payment cap, a daily budget of 4x the on-chain period cap and a lifetime cap of 20x.
- The audit trail is hash-chained and signed by the agent key, but the chain head is held by the browser session, so dropping the newest entries is not detectable.

Simulation (offline, fake funds and time): `/firewall` and `/dashboard`.

## Reproduce
```
scripts/deploy-robinhood.sh   # testnet deploy with an encrypted keystore (--password-file allowed on testnet only)
FACTORY=0x… scripts/testnet-bootstrap.sh
LIVE_RPC=1 npm --prefix firewall test    # real eth_simulateV1 against the testnet RPC
```
The hosted app needs `AGENT_PRIVATE_KEY` (the agent key of the vault) as a server environment variable. Without it the firewall still decides, but nothing is signed.
