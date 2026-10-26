// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {CustosFactory} from "../src/CustosFactory.sol";
import {Brand} from "../src/Brand.sol";

/// Deploys ONLY the CustosFactory (no admin, no fees, no token) to Robinhood Chain.
///
/// SIGNER: this script never reads a private key from env/files. `vm.startBroadcast()` with no argument
/// uses whatever signer forge was given on the command line: `--account <keystore>` or `--ledger`
/// (or `--sender` + `--unlocked` for a throwaway local node). Dry-run = simply omit `--broadcast`:
/// forge then only SIMULATES against the RPC and sends nothing.
///
/// CHAIN GUARD: refuses any chain except Robinhood testnet (46630), Robinhood mainnet (4663) and the local
/// anvil/foundry chains (31337 / 1337) so a wrong `--rpc-url` can't deploy somewhere unexpected.
/// MAINNET GUARD: mainnet additionally needs CUSTOS_MAINNET_OK=yes in the environment (a deliberate speed bump,
/// not a secret) and is documented in docs/DEPLOY-ROBINHOOD.md with a pre-deploy checklist.
contract DeployRobinhood is Script {
    uint256 internal constant MAINNET = 4663;
    uint256 internal constant TESTNET = 46630;

    error UnsupportedChain(uint256 chainId);
    error MainnetNotConfirmed();
    error NoCodeAfterDeploy();

    function run() external returns (CustosFactory f) {
        uint256 id = block.chainid;
        if (id != MAINNET && id != TESTNET && id != 31337 && id != 1337) revert UnsupportedChain(id);
        if (id == MAINNET && keccak256(bytes(vm.envOr("CUSTOS_MAINNET_OK", string("")))) != keccak256("yes")) {
            revert MainnetNotConfirmed();
        }

        console.log(string.concat(Brand.NAME, ": ", Brand.TAGLINE));
        console.log("chainid:", id);
        console.log(id == MAINNET ? "target: Robinhood Chain MAINNET" : id == TESTNET ? "target: Robinhood Chain TESTNET" : "target: local dev chain");

        vm.startBroadcast(); // signer comes from the forge CLI only
        f = new CustosFactory();
        vm.stopBroadcast();

        if (address(f).code.length == 0) revert NoCodeAfterDeploy();
        console.log("CustosFactory:", address(f));
        console.log("factory runtime size (bytes):", address(f).code.length);
    }
}
