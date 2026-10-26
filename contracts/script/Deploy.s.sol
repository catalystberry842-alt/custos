// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {CustosFactory} from "../src/CustosFactory.sol";

/// Deploys ONLY the factory (no admin, no fees, no token).
/// NO private key is read from env or files here. Signer comes from the forge CLI:
///   local anvil:   forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --unlocked --sender <anvil acct> --broadcast
///   Robinhood Chain: use script/DeployRobinhood.s.sol (chain guard + docs/DEPLOY-ROBINHOOD.md). NOT done by this project.
contract Deploy is Script {
    function run() external returns (CustosFactory f) {
        vm.startBroadcast();
        f = new CustosFactory();
        vm.stopBroadcast();
        console.log("CustosFactory:", address(f));
    }
}
