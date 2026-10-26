// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20Min} from "./interfaces/IERC20Min.sol";

/// @title Heirloom — non-custodial crypto dead-man's switch (one vault per owner)
/// @notice Owner deposits the native gas asset (ETH on Robinhood Chain) + whitelisted ERC-20s (e.g. stablecoins). While the owner keeps checking in, nothing
///         can happen. If the owner goes silent for `interval + grace`, N-of-M guardians may
///         approve a release; after a `challengeWindow` (owner can cancel by acting) anyone can
///         execute it and every asset goes to the beneficiary the owner chose. Guardians can
///         never pick the destination, withdraw, or change config.
/// @dev    Design notes:
///         - Oracle-free: only `block.timestamp`. NEVER `block.number`: on Arbitrum-Orbit chains such as
///           Robinhood Chain it is an L1 block-number estimate that updates only periodically, and
///           `block.prevrandao`/`difficulty` are constants. Neither is read anywhere (guarded by
///           test/RobinhoodChain.t.sol, which also greps this file).
///         - Not upgradeable, no admin, no external dependencies.
///         - Every owner action ("proof of life") bumps `epoch`, voiding votes and challenges.
///         - UNAUDITED. Do not hold real value before an audit.
contract Heirloom {
    // ───────────────────────────── types ─────────────────────────────
    enum Status {
        Active, // owner is within interval
        Grace, // interval passed, owner is "late", guardians cannot act yet
        AwaitingGuardians, // grace over, guardians may approve
        Challenge, // threshold reached, owner can still cancel
        Executable, // challenge window over, anyone may execute
        Paused, // vacation mode
        Released, // terminal: funds sent to beneficiary
        Closed // terminal: owner closed the vault
    }

    struct Params {
        address beneficiary;
        address[] guardians;
        uint8 threshold;
        uint64 interval;
        uint64 grace;
        uint64 challengeWindow;
        uint64 fallbackDelay; // 0 = disabled
    }

    // ─────────────────────────── constants ───────────────────────────
    uint64 public constant MIN_INTERVAL = 1 days;
    uint64 public constant MAX_INTERVAL = 5 * 365 days;
    uint64 public constant MIN_GRACE = 1 days;
    uint64 public constant MAX_GRACE = 365 days;
    uint64 public constant MIN_CHALLENGE = 1 days;
    uint64 public constant MAX_CHALLENGE = 90 days;
    uint64 public constant MIN_FALLBACK = 7 days;
    uint64 public constant MAX_FALLBACK = 5 * 365 days;
    uint64 public constant MAX_PAUSE = 90 days;
    uint256 public constant MAX_GUARDIANS = 10;
    uint256 public constant MAX_TOKENS = 32;
    /// @dev Gas cap for each outgoing token/native transfer during release so one hostile
    ///      recipient/token cannot block the rest. Leftovers are recoverable via sweep*.
    uint256 public constant TRANSFER_GAS = 300_000;

    // ─────────────────────────── storage ────────────────────────────
    address public immutable owner;
    address public beneficiary;
    address public payout; // set on Released (beneficiary) / Closed (owner)

    uint64 public interval;
    uint64 public grace;
    uint64 public challengeWindow;
    uint64 public fallbackDelay;

    uint64 public lastCheckIn;
    uint64 public pausedUntil;
    uint64 public challengeEnd; // 0 = no challenge running
    uint256 public epoch = 1; // starts at 1 so default-0 mappings never look "voted"

    uint8 public threshold;
    uint8 public approvalCount;
    bool public released;
    bool public closed;

    address[] private _guardians;
    mapping(address => bool) public isGuardian;
    mapping(address => uint256) public approvedEpoch; // guardian => epoch of their live vote

    address[] private _tokens;
    mapping(address => bool) public isToken;

    uint256 private _lock = 1;

    // ───────────────────────────── events ────────────────────────────
    event VaultCreated(address indexed owner, address indexed beneficiary, uint8 threshold, uint256 guardianCount);
    event CheckedIn(address indexed owner, uint64 at, uint256 epoch);
    event Deposited(address indexed from, uint256 amount);
    event TokenDeposited(address indexed token, address indexed from, uint256 amount);
    event NativeWithdrawn(uint256 amount);
    event TokenWithdrawn(address indexed token, uint256 amount);
    event TokenListed(address indexed token);
    event TokenDelisted(address indexed token);
    event GuardianApproved(address indexed guardian, uint8 approvals, uint8 threshold, uint256 epoch);
    event ApprovalWithdrawn(address indexed guardian, uint8 approvals);
    event ChallengeStarted(uint64 challengeEnd, uint256 epoch);
    event ReleaseCancelled(uint256 newEpoch);
    event GuardianReplaced(address indexed oldGuardian, address indexed newGuardian);
    event GuardiansUpdated(address[] guardians, uint8 threshold);
    event BeneficiaryChanged(address indexed oldBeneficiary, address indexed newBeneficiary);
    event TimingsUpdated(uint64 interval, uint64 grace, uint64 challengeWindow, uint64 fallbackDelay);
    event Paused(uint64 until);
    event Unpaused();
    event Released(address indexed beneficiary, uint256 nativeAmount, bool viaFallback);
    event Closed(address indexed owner);
    event TransferFailed(address indexed token, address indexed to, uint256 amount); // token==0 → native
    event Forwarded(address indexed token, address indexed to, uint256 amount);
    event PayoutRedirected(address indexed oldPayout, address indexed newPayout);

    // ───────────────────────────── errors ────────────────────────────
    error NotOwner();
    error NotGuardian();
    error NotBeneficiary();
    error Finished(); // released or closed
    error NotFinished();
    error Reentrancy();
    error ZeroAddress();
    error BadParams();
    error NotYetExpired();
    error IsPaused();
    error AlreadyApproved();
    error NotApproved();
    error ChallengeRunning();
    error ChallengeNotOver();
    error FallbackNotAvailable();
    error NotAGuardian();
    error AlreadyGuardian();
    error TokenNotListed();
    error TokenAlreadyListed();
    error TooManyTokens();
    error TransferFailedErr();
    error NothingToDo();

    // ─────────────────────────── modifiers ───────────────────────────
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyGuardian() {
        if (!isGuardian[msg.sender]) revert NotGuardian();
        _;
    }

    modifier live() {
        if (released || closed) revert Finished();
        _;
    }

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    // ───────────────────────── constructor ───────────────────────────
    constructor(address owner_, Params memory p) {
        if (owner_ == address(0)) revert ZeroAddress();
        owner = owner_;
        _setBeneficiary(p.beneficiary);
        _setTimings(p.interval, p.grace, p.challengeWindow, p.fallbackDelay);
        _setGuardians(p.guardians, p.threshold);
        lastCheckIn = uint64(block.timestamp);
        emit VaultCreated(owner_, p.beneficiary, p.threshold, p.guardians.length);
    }

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    // ───────────────────────── owner: liveness ────────────────────────

    /// @notice Proof of life. Resets the timer and cancels any running release.
    function checkIn() external onlyOwner live {
        _touch();
    }

    /// @notice Explicit alias for cancelling a running release during the challenge window.
    function cancelRelease() external onlyOwner live {
        if (challengeEnd == 0 && approvalCount == 0) revert NothingToDo();
        _touch();
    }

    /// @notice "Vacation mode": pushes the deadline anchor `duration` into the future. Self-expiring
    ///         (max 90 days) so a dead owner can never lock funds forever by pausing.
    function pause(uint64 duration) external onlyOwner live {
        if (duration == 0 || duration > MAX_PAUSE) revert BadParams();
        pausedUntil = uint64(block.timestamp) + duration;
        _touch();
        emit Paused(pausedUntil);
    }

    /// @notice End vacation mode early; timer restarts from now.
    function unpause() external onlyOwner live {
        if (pausedUntil <= block.timestamp) revert NothingToDo();
        pausedUntil = 0;
        _touch();
        emit Unpaused();
    }

    // ───────────────────────── owner: config ─────────────────────────
    // Every owner action is a proof of life and therefore calls _touch().

    function setBeneficiary(address b) external onlyOwner live {
        address old = beneficiary;
        _setBeneficiary(b);
        _touch();
        emit BeneficiaryChanged(old, b);
    }

    function setTimings(uint64 interval_, uint64 grace_, uint64 challengeWindow_, uint64 fallbackDelay_)
        external
        onlyOwner
        live
    {
        _setTimings(interval_, grace_, challengeWindow_, fallbackDelay_);
        _touch();
    }

    /// @notice Replace the entire guardian set and threshold.
    function setGuardians(address[] calldata g, uint8 threshold_) external onlyOwner live {
        _setGuardians(g, threshold_);
        _touch();
    }

    /// @notice Swap one guardian (lost keys / fallen out). Threshold is unchanged. Any pending
    ///         votes are voided by the epoch bump.
    function replaceGuardian(address oldG, address newG) external onlyOwner live {
        if (!isGuardian[oldG]) revert NotAGuardian();
        if (newG == address(0) || newG == owner) revert ZeroAddress();
        if (isGuardian[newG]) revert AlreadyGuardian();
        uint256 n = _guardians.length;
        for (uint256 i; i < n; ++i) {
            if (_guardians[i] == oldG) {
                _guardians[i] = newG;
                break;
            }
        }
        isGuardian[oldG] = false;
        isGuardian[newG] = true;
        _touch();
        emit GuardianReplaced(oldG, newG);
    }

    // ───────────────────────── owner: assets ─────────────────────────

    function addToken(address token) external onlyOwner live {
        _listToken(token);
        _touch();
    }

    /// @notice Delist (does not move funds). Withdraw first; leftovers are only recoverable after release/close.
    function removeToken(address token) external onlyOwner live {
        if (!isToken[token]) revert TokenNotListed();
        uint256 n = _tokens.length;
        for (uint256 i; i < n; ++i) {
            if (_tokens[i] == token) {
                _tokens[i] = _tokens[n - 1];
                _tokens.pop();
                break;
            }
        }
        isToken[token] = false;
        _touch();
        emit TokenDelisted(token);
    }

    /// @notice Pull `amount` of `token` from the owner (requires prior approve to THIS vault only). Auto-lists.
    function depositToken(address token, uint256 amount) external onlyOwner live nonReentrant {
        if (!isToken[token]) _listToken(token);
        uint256 beforeBal = IERC20Min(token).balanceOf(address(this));
        _safeTransferFrom(token, msg.sender, address(this), amount);
        uint256 got = IERC20Min(token).balanceOf(address(this)) - beforeBal;
        _touch();
        emit TokenDeposited(token, msg.sender, got);
    }

    function withdrawNative(uint256 amount) external onlyOwner live nonReentrant {
        _touch();
        emit NativeWithdrawn(amount);
        (bool ok,) = owner.call{value: amount}("");
        if (!ok) revert TransferFailedErr();
    }

    function withdrawToken(address token, uint256 amount) external onlyOwner live nonReentrant {
        _touch();
        emit TokenWithdrawn(token, amount);
        _safeTransfer(token, owner, amount);
    }

    /// @notice Owner winds the vault down: everything back to the owner, switch disabled forever.
    function closeVault() external onlyOwner live nonReentrant {
        closed = true;
        payout = owner;
        challengeEnd = 0;
        emit Closed(owner);
        _forwardAll(owner);
    }

    // ────────────────────────── guardians ────────────────────────────

    /// @notice Guardian votes to release. Only after interval + grace has elapsed with no owner
    ///         activity. When approvals reach the threshold the challenge window begins.
    function approveRelease() external onlyGuardian live {
        if (block.timestamp <= graceEnd()) revert NotYetExpired(); // covers paused too (anchor moves)
        if (challengeEnd != 0) revert ChallengeRunning();
        if (approvedEpoch[msg.sender] == epoch) revert AlreadyApproved();
        approvedEpoch[msg.sender] = epoch;
        unchecked {
            ++approvalCount;
        }
        emit GuardianApproved(msg.sender, approvalCount, threshold, epoch);
        if (approvalCount >= threshold) {
            challengeEnd = uint64(block.timestamp) + challengeWindow;
            emit ChallengeStarted(challengeEnd, epoch);
        }
    }

    /// @notice Retract a vote — only while the challenge has not started.
    function withdrawApproval() external onlyGuardian live {
        if (challengeEnd != 0) revert ChallengeRunning();
        if (approvedEpoch[msg.sender] != epoch) revert NotApproved();
        approvedEpoch[msg.sender] = 0;
        unchecked {
            --approvalCount;
        }
        emit ApprovalWithdrawn(msg.sender, approvalCount);
    }

    // ──────────────────────────── release ────────────────────────────

    /// @notice Anyone (keeper, heir, guardian) may execute once the challenge window is over.
    function executeRelease() external live nonReentrant {
        if (challengeEnd == 0) revert NotYetExpired();
        if (block.timestamp < challengeEnd) revert ChallengeNotOver();
        _release(false);
    }

    /// @notice Guardian-less fallback (if enabled): beneficiary claims `fallbackDelay` after grace ends.
    function beneficiaryClaim() external live nonReentrant {
        if (msg.sender != beneficiary) revert NotBeneficiary();
        if (fallbackDelay == 0 || block.timestamp <= fallbackOpensAt()) revert FallbackNotAvailable();
        _release(true);
    }

    /// @notice Re-attempt forwarding of anything left (native + listed tokens) after release/close.
    function sweep() external nonReentrant {
        if (!released && !closed) revert NotFinished();
        _forwardAll(payout);
    }

    /// @notice Forward any token (listed or not, e.g. airdrops, tokens that hit the gas cap). Full gas, reverts on failure.
    function sweepToken(address token) external nonReentrant {
        if (!released && !closed) revert NotFinished();
        uint256 bal = IERC20Min(token).balanceOf(address(this));
        if (bal == 0) revert NothingToDo();
        _safeTransfer(token, payout, bal);
        emit Forwarded(token, payout, bal);
    }

    /// @notice After release the beneficiary may point payouts to a different address (e.g. if the
    ///         original is a contract that rejects native ETH).
    function redirectPayout(address to) external {
        if (!released) revert NotFinished();
        if (msg.sender != beneficiary) revert NotBeneficiary();
        if (to == address(0)) revert ZeroAddress();
        emit PayoutRedirected(payout, to);
        payout = to;
    }

    // ───────────────────────────── views ─────────────────────────────

    /// @notice Reference point for the timer: last check-in or end of vacation, whichever is later.
    function anchor() public view returns (uint64) {
        return pausedUntil > lastCheckIn ? pausedUntil : lastCheckIn;
    }

    function expiry() public view returns (uint64) {
        return anchor() + interval;
    }

    function graceEnd() public view returns (uint64) {
        return anchor() + interval + grace;
    }

    function fallbackOpensAt() public view returns (uint64) {
        return graceEnd() + fallbackDelay;
    }

    function status() public view returns (Status) {
        if (released) return Status.Released;
        if (closed) return Status.Closed;
        if (block.timestamp < pausedUntil) return Status.Paused;
        if (challengeEnd != 0) return block.timestamp >= challengeEnd ? Status.Executable : Status.Challenge;
        if (block.timestamp <= expiry()) return Status.Active;
        if (block.timestamp <= graceEnd()) return Status.Grace;
        return Status.AwaitingGuardians;
    }

    function guardians() external view returns (address[] memory) {
        return _guardians;
    }

    function tokens() external view returns (address[] memory) {
        return _tokens;
    }

    function guardianCount() external view returns (uint256) {
        return _guardians.length;
    }

    function hasApproved(address g) external view returns (bool) {
        return isGuardian[g] && approvedEpoch[g] == epoch;
    }

    // ─────────────────────────── internals ───────────────────────────

    function _touch() internal {
        bool hadRelease = challengeEnd != 0 || approvalCount != 0;
        lastCheckIn = uint64(block.timestamp);
        unchecked {
            ++epoch;
        }
        approvalCount = 0;
        challengeEnd = 0;
        emit CheckedIn(owner, lastCheckIn, epoch);
        if (hadRelease) emit ReleaseCancelled(epoch);
    }

    function _release(bool viaFallback) internal {
        released = true; // effects before interactions
        payout = beneficiary;
        challengeEnd = 0;
        emit Released(beneficiary, address(this).balance, viaFallback);
        _forwardAll(beneficiary);
    }

    /// @dev Best-effort: never reverts because of the recipient or a token. Failures emit TransferFailed.
    function _forwardAll(address to) internal {
        uint256 nat = address(this).balance;
        if (nat > 0) {
            (bool ok,) = to.call{value: nat, gas: TRANSFER_GAS}("");
            if (ok) emit Forwarded(address(0), to, nat);
            else emit TransferFailed(address(0), to, nat);
        }
        uint256 n = _tokens.length;
        for (uint256 i; i < n; ++i) {
            address t = _tokens[i];
            (bool okBal, uint256 bal) = _boundedBalanceOf(t);
            if (!okBal || bal == 0) continue;
            if (_boundedTransfer(t, to, bal)) emit Forwarded(t, to, bal);
            else emit TransferFailed(t, to, bal);
        }
    }

    function _boundedBalanceOf(address token) internal view returns (bool ok, uint256 bal) {
        if (token.code.length == 0) return (false, 0);
        bytes memory data = abi.encodeCall(IERC20Min.balanceOf, (address(this)));
        uint256 size;
        assembly {
            mstore(0x00, 0)
            ok := staticcall(TRANSFER_GAS, token, add(data, 0x20), mload(data), 0x00, 0x20)
            size := returndatasize()
            bal := mload(0x00)
        }
        if (!ok || size < 32) return (false, 0);
    }

    /// @dev Low-level transfer: capped gas, only copies 32 bytes of return data (no returndata bombs).
    function _boundedTransfer(address token, address to, uint256 amount) internal returns (bool good) {
        if (token.code.length == 0) return false;
        bytes memory data = abi.encodeCall(IERC20Min.transfer, (to, amount));
        bool ok;
        uint256 size;
        uint256 ret;
        assembly {
            mstore(0x00, 0)
            ok := call(TRANSFER_GAS, token, 0, add(data, 0x20), mload(data), 0x00, 0x20)
            size := returndatasize()
            ret := mload(0x00)
        }
        // Accept: success + (no return data [USDT-style] OR returns true)
        good = ok && (size == 0 || (size >= 32 && ret == 1));
    }

    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory ret) = token.call(abi.encodeCall(IERC20Min.transfer, (to, amount)));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailedErr();
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        (bool ok, bytes memory ret) = token.call(abi.encodeCall(IERC20Min.transferFrom, (from, to, amount)));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailedErr();
    }

    function _listToken(address token) internal {
        if (token == address(0) || token.code.length == 0) revert ZeroAddress();
        if (isToken[token]) revert TokenAlreadyListed();
        if (_tokens.length >= MAX_TOKENS) revert TooManyTokens();
        isToken[token] = true;
        _tokens.push(token);
        emit TokenListed(token);
    }

    function _setBeneficiary(address b) internal {
        if (b == address(0) || b == owner || b == address(this)) revert BadParams();
        beneficiary = b;
    }

    function _setTimings(uint64 i, uint64 g, uint64 c, uint64 f) internal {
        if (i < MIN_INTERVAL || i > MAX_INTERVAL) revert BadParams();
        if (g < MIN_GRACE || g > MAX_GRACE) revert BadParams();
        if (c < MIN_CHALLENGE || c > MAX_CHALLENGE) revert BadParams();
        if (f != 0 && (f < MIN_FALLBACK || f > MAX_FALLBACK)) revert BadParams();
        interval = i;
        grace = g;
        challengeWindow = c;
        fallbackDelay = f;
        emit TimingsUpdated(i, g, c, f);
    }

    function _setGuardians(address[] memory g, uint8 t) internal {
        uint256 n = g.length;
        if (n == 0 || n > MAX_GUARDIANS || t == 0 || t > n) revert BadParams();
        // clear old
        uint256 old = _guardians.length;
        for (uint256 i; i < old; ++i) {
            isGuardian[_guardians[i]] = false;
        }
        delete _guardians;
        for (uint256 i; i < n; ++i) {
            address a = g[i];
            if (a == address(0) || a == owner) revert ZeroAddress();
            if (isGuardian[a]) revert AlreadyGuardian();
            isGuardian[a] = true;
            _guardians.push(a);
        }
        threshold = t;
        emit GuardiansUpdated(g, t);
    }
}
