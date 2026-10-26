// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @dev Minimal ERC-20 surface used by Custos.
interface IERC20Min {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
}
