// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {HeirloomFactory} from "../src/HeirloomFactory.sol";

/// Deploys ONLY the factory (no admin, no fees, no token).
/// NO private key is read from env or files here. Signer comes from the forge CLI:
///   local anvil:   forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --unlocked --sender <anvil acct> --broadcast
///   real network:  forge script ... --account <keystore-name> (or --ledger). NOT done by this project.
contract Deploy is Script {
    function run() external returns (HeirloomFactory f) {
        vm.startBroadcast();
        f = new HeirloomFactory();
        vm.stopBroadcast();
        console.log("HeirloomFactory:", address(f));
    }
}
