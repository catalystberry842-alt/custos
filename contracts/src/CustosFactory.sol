// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Custos} from "./Custos.sol";

/// @title CustosFactory — deploys one isolated Custos vault per owner-call. No admin, no fees.
contract CustosFactory {
    event VaultDeployed(address indexed owner, address indexed vault, address indexed beneficiary);

    mapping(address => address[]) private _vaultsOf;
    address[] public allVaults;

    function create(Custos.Params calldata p) external returns (address vault) {
        vault = address(new Custos(msg.sender, p));
        _vaultsOf[msg.sender].push(vault);
        allVaults.push(vault);
        emit VaultDeployed(msg.sender, vault, p.beneficiary);
    }

    function vaultsOf(address owner) external view returns (address[] memory) {
        return _vaultsOf[owner];
    }

    function totalVaults() external view returns (uint256) {
        return allVaults.length;
    }
}
