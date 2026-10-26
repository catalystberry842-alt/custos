// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IGuardianStaking — DESIGN STUB ONLY (not implemented, not deployed)
/// @notice Describes the optional token hook from docs/token-design.md.
///         Heirloom vaults do NOT depend on this interface: the core switch works
///         with zero token and zero staking. A future registry could let vault
///         owners *optionally* pick guardians / check-in operators that have stake
///         at risk, and let a verifiable on-chain fault slash that stake.
interface IGuardianStaking {
    enum Role { Guardian, CheckInOperator }

    event Staked(address indexed operator, Role role, uint256 amount);
    event UnstakeRequested(address indexed operator, uint256 amount, uint256 availableAt);
    event Unstaked(address indexed operator, uint256 amount);
    event Slashed(address indexed operator, address indexed vault, uint256 amount, bytes32 reason);

    /// @notice Lock `amount` of the staking token to become eligible in `role`.
    function stake(Role role, uint256 amount) external;

    /// @notice Start the unbonding delay. Funds stay slashable until `availableAt`.
    function requestUnstake(uint256 amount) external;

    /// @notice Withdraw after the unbonding delay.
    function unstake() external;

    /// @notice Stake currently bonded for `operator` (slashable).
    function stakeOf(address operator) external view returns (uint256);

    /// @notice True if `operator` has at least the minimum stake for `role`.
    function isEligible(address operator, Role role) external view returns (bool);

    /// @notice Slash `operator` for a *provable on-chain* fault attributed to `vault`.
    ///         Intended faults (each must be verifiable from chain state alone):
    ///           - approving a release that the owner cancelled inside the challenge window
    ///             is NOT slashable by itself (could be honest); only e.g. approvals signed
    ///             off-chain that contradict an on-chain attestation would be.
    ///         Exact fault proofs are an open design question — see docs/token-design.md.
    ///         Slashing MUST be gated by a verifier (governance-minimised, timelocked) and
    ///         MUST NOT be callable by vault owners to extort guardians.
    function slash(address operator, address vault, uint256 amount, bytes32 reason, bytes calldata proof) external;

    /// @notice Pay a service fee in the staking token to the operator pool (optional).
    function payServiceFee(address vault, uint256 amount) external;
}
