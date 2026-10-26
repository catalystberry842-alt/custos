// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20Min} from "./interfaces/IERC20Min.sol";

/// @title Custos — non-custodial dead-man's switch for AI agents and their owners (one vault per owner)
/// @notice Owner deposits the native gas asset (ETH on Robinhood Chain) + whitelisted ERC-20s (e.g. stablecoins). While the owner keeps checking in, nothing
///         can happen. If the owner goes silent for `interval + grace`, N-of-M guardians may
///         approve a release; after a `challengeWindow` (owner can cancel by acting) anyone can
///         execute it and every asset goes to the beneficiary the owner chose. Guardians can
///         never pick the destination, withdraw, or change config.
///
///         AGENT LAYER: the owner may authorise ONE `agent` (an AI's operator/session key) that can spend
///         from the vault ONLY within owner-set limits (per-tx cap, per-period cap, allowlisted assets and
///         recipients) and ONLY while the owner is alive. The agent is frozen automatically once the owner's
///         proof of life lapses (interval + an owner-set late allowance ≤ grace), can be frozen by any
///         guardian once the owner is late, and by the owner at any time. Owner activity unfreezes a
///         guardian/lapse freeze. On guardian threshold approval the vault either returns everything to the
///         beneficiary (Outcome.Release, agent shut down for good) or hands ownership + the funds to the
///         owner-named `successor` (Outcome.Handover; the agent is revoked and the successor must
///         re-authorise one). Guardians can never choose a destination: both are fixed by the owner beforehand.
///         The agent can never call any owner/guardian function and its spending is NOT proof of life.
/// @dev    Design notes:
///         - Oracle-free: only `block.timestamp`. NEVER `block.number`: on Arbitrum-Orbit chains such as
///           Robinhood Chain it is an L1 block-number estimate that updates only periodically, and
///           `block.prevrandao`/`difficulty` are constants. Neither is read anywhere (guarded by
///           test/RobinhoodChain.t.sol, which also greps this file).
///         - Not upgradeable, no admin, no external dependencies. `owner` changes only through a guardian-approved
///           Handover to the successor the owner named in advance.
///         - Every owner action ("proof of life") bumps `epoch`, voiding votes and challenges.
///         - UNAUDITED. Do not hold real value before an audit.
contract Custos {
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

    /// @dev What the guardians vote for. Release = funds to the beneficiary (agent shut down for good);
    ///      Handover = ownership + funds to the pre-named successor (agent revoked, successor re-authorises).
    enum Outcome {
        Release,
        Handover
    }

    enum AgentState {
        None, // no agent authorised
        Active, // agent may spend within limits
        FrozenByOwner, // owner pressed the kill-switch
        FrozenByGuardian, // a guardian froze it while the owner was late (cleared by any owner activity)
        FrozenLapsed, // owner's proof of life lapsed past interval + late allowance (cleared by owner activity)
        Stopped // vault released / closed
    }

    struct AssetLimit {
        uint128 perTx;
        uint128 perPeriod;
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
    uint64 public constant MIN_AGENT_PERIOD = 1 hours;
    uint64 public constant MAX_AGENT_PERIOD = 365 days;
    uint256 public constant MAX_AGENT_ASSETS = 8;
    uint256 public constant MAX_RECIPIENTS = 32;
    /// @dev Gas cap for each outgoing token/native transfer during release so one hostile
    ///      recipient/token cannot block the rest. Leftovers are recoverable via sweep*.
    uint256 public constant TRANSFER_GAS = 300_000;

    // ─────────────────────────── storage ────────────────────────────
    address public owner; // changes only via guardian-approved Handover to `successor`
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

    // agent layer
    address public agent;
    uint64 public agentPeriod; // length of the rolling spend window
    uint64 public agentLateAllowance; // how long past `expiry()` the agent may keep spending (clamped to `grace`)
    bool public agentOwnerFrozen;
    uint256 public agentGuardianFrozenEpoch; // == epoch ⇒ frozen by a guardian; any owner action bumps epoch
    address public successor;
    Outcome public pendingOutcome;
    mapping(address => AssetLimit) public assetLimit; // address(0) = native ETH; perTx == 0 ⇒ not allowed
    mapping(address => uint64) public periodStart;
    mapping(address => uint128) public periodSpent;
    address[] private _agentAssets;
    mapping(address => bool) public isRecipient;
    address[] private _recipients;
    mapping(uint256 => mapping(uint8 => uint8)) private _outcomeVotes; // epoch => outcome => votes
    mapping(address => uint8) public votedOutcome; // valid while approvedEpoch[g] == epoch

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
    event AgentSet(address indexed agent, uint64 period, uint64 lateAllowance);
    event AgentRevoked(address indexed agent);
    event AssetLimitSet(address indexed asset, uint128 perTx, uint128 perPeriod);
    event AssetLimitRemoved(address indexed asset);
    event RecipientSet(address indexed to, bool allowed);
    event AgentSpent(address indexed agent, address indexed asset, address indexed to, uint256 amount, uint256 periodSpent, uint256 periodCap);
    event AgentFrozen(address indexed by, uint8 kind); // kind: 0 owner, 1 guardian
    event AgentUnfrozen();
    event SuccessorSet(address indexed successor);
    event OutcomeVoted(address indexed guardian, Outcome outcome);
    event HandedOver(address indexed oldOwner, address indexed newOwner);

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
    error NotAgent();
    error AgentIsFrozen();
    error NoAgent();
    error AssetNotAllowed();
    error RecipientNotAllowed();
    error OverPerTxLimit();
    error OverPeriodLimit();
    error RoleConflict();
    error NoSuccessor();
    error AssetHasLimit();
    error TooMany();

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
        if (newG == agent || newG == successor) revert RoleConflict();
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
        if (assetLimit[token].perTx != 0) revert AssetHasLimit();
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

    // ──────────────────────── owner: AI agent ────────────────────────
    // Every owner action is proof of life (calls _touch()). The agent's own actions are NOT.

    /// @notice Authorise (or replace) the single agent key. Keeps limits/allowlist, resets spend counters and the
    ///         owner freeze. `lateAllowance_` = how long after the check-in deadline the agent may keep spending
    ///         (0 = stops the moment the owner is late; effective value is clamped to `grace`).
    function setAgent(address agent_, uint64 period_, uint64 lateAllowance_) external onlyOwner live {
        if (agent_ != agent) _requireFreeRole(agent_); // re-submitting the current key (to change limits) is fine
        else if (agent_ == address(0)) revert ZeroAddress();
        if (isRecipient[agent_]) revert RoleConflict();
        if (period_ < MIN_AGENT_PERIOD || period_ > MAX_AGENT_PERIOD || lateAllowance_ > MAX_GRACE) revert BadParams();
        agent = agent_;
        agentPeriod = period_;
        agentLateAllowance = lateAllowance_;
        agentOwnerFrozen = false;
        _resetSpent();
        _touch();
        emit AgentSet(agent_, period_, lateAllowance_);
    }

    /// @notice Remove the agent AND clear every limit and recipient (safe default; re-granting is explicit).
    function revokeAgent() external onlyOwner live {
        address a = agent;
        if (a == address(0)) revert NoAgent();
        _clearAgent();
        _touch();
        emit AgentRevoked(a);
    }

    /// @notice Allow the agent to spend `asset` (address(0) = ETH): at most `perTx` per call, `perPeriod` per window.
    function setAssetLimit(address asset, uint128 perTx, uint128 perPeriod) external onlyOwner live {
        if (perTx == 0 || perPeriod < perTx) revert BadParams();
        if (assetLimit[asset].perTx == 0) {
            if (_agentAssets.length >= MAX_AGENT_ASSETS) revert TooMany();
            _agentAssets.push(asset);
        }
        if (asset != address(0) && !isToken[asset]) _listToken(asset); // so release forwards any remainder
        assetLimit[asset] = AssetLimit(perTx, perPeriod);
        _touch();
        emit AssetLimitSet(asset, perTx, perPeriod);
    }

    function removeAssetLimit(address asset) external onlyOwner live {
        if (assetLimit[asset].perTx == 0) revert NothingToDo();
        _dropAsset(asset);
        _touch();
        emit AssetLimitRemoved(asset);
    }

    /// @notice Add/remove an address the agent may pay. Empty allowlist = the agent cannot spend at all.
    function setRecipient(address to, bool allowed) external onlyOwner live {
        if (to == address(0) || to == address(this) || to == agent) revert RoleConflict();
        if (isRecipient[to] == allowed) revert NothingToDo();
        if (allowed) {
            if (_recipients.length >= MAX_RECIPIENTS) revert TooMany();
            isRecipient[to] = true;
            _recipients.push(to);
        } else {
            isRecipient[to] = false;
            uint256 n = _recipients.length;
            for (uint256 i; i < n; ++i) {
                if (_recipients[i] == to) {
                    _recipients[i] = _recipients[n - 1];
                    _recipients.pop();
                    break;
                }
            }
        }
        _touch();
        emit RecipientSet(to, allowed);
    }

    /// @notice Owner kill-switch: the agent cannot spend until `unfreezeAgent()` (survives owner check-ins).
    function freezeAgent() external onlyOwner live {
        if (agent == address(0)) revert NoAgent();
        if (agentOwnerFrozen) revert NothingToDo();
        agentOwnerFrozen = true;
        _touch();
        emit AgentFrozen(msg.sender, 0);
    }

    function unfreezeAgent() external onlyOwner live {
        if (!agentOwnerFrozen) revert NothingToDo();
        agentOwnerFrozen = false;
        _touch();
        emit AgentUnfrozen();
    }

    /// @notice Name who takes over (ownership + funds) if guardians approve a Handover. address(0) clears it.
    function setSuccessor(address s_) external onlyOwner live {
        if (s_ != address(0)) {
            _requireFreeRole(s_);
            if (isRecipient[s_]) revert RoleConflict();
        }
        successor = s_;
        _touch();
        emit SuccessorSet(s_);
    }

    // ──────────────────────────── the agent ───────────────────────────

    /// @notice The ONLY thing the agent key can do. Pays `amount` of `asset` to an allowlisted `to`, within the
    ///         per-tx and rolling per-period caps, while the agent is not frozen. Counters are updated BEFORE the
    ///         external call; the call is gas-capped; any failure reverts the whole spend (nothing is consumed).
    ///         Does NOT count as owner proof of life and cannot touch any configuration.
    function agentSpend(address asset, address to, uint256 amount) external live nonReentrant {
        if (msg.sender != agent || msg.sender == address(0)) revert NotAgent();
        if (
            agentOwnerFrozen || agentGuardianFrozenEpoch == epoch || challengeEnd != 0
                || block.timestamp > agentCutoff()
        ) revert AgentIsFrozen();
        AssetLimit memory l = assetLimit[asset];
        if (l.perTx == 0) revert AssetNotAllowed();
        if (!isRecipient[to]) revert RecipientNotAllowed();
        if (amount == 0 || amount > l.perTx) revert OverPerTxLimit();

        uint64 start = periodStart[asset];
        uint256 spent = periodSpent[asset];
        if (start == 0 || block.timestamp >= uint256(start) + agentPeriod) {
            start = uint64(block.timestamp);
            spent = 0;
        }
        uint256 total = spent + amount;
        if (total > l.perPeriod) revert OverPeriodLimit();
        periodStart[asset] = start;
        periodSpent[asset] = uint128(total);
        emit AgentSpent(msg.sender, asset, to, amount, total, l.perPeriod);

        if (asset == address(0)) {
            (bool ok,) = to.call{value: amount, gas: TRANSFER_GAS}("");
            if (!ok) revert TransferFailedErr();
        } else if (!_boundedTransfer(asset, to, amount)) {
            revert TransferFailedErr();
        }
    }

    // ────────────────────────── guardians ────────────────────────────

    /// @notice Guardian votes to RELEASE everything to the beneficiary (agent shut down for good). Only after
    ///         interval + grace has elapsed with no owner activity. When approvals for one outcome reach the
    ///         threshold the challenge window begins.
    function approveRelease() external onlyGuardian live {
        _approve(Outcome.Release);
    }

    /// @notice Guardian votes for an outcome: Release (beneficiary) or Handover (owner-named successor).
    ///         N guardians must agree on the SAME outcome. Handover needs a successor to be set.
    function approveOutcome(Outcome o) external onlyGuardian live {
        _approve(o);
    }

    function _approve(Outcome o) internal {
        if (block.timestamp <= graceEnd()) revert NotYetExpired(); // covers paused too (anchor moves)
        if (challengeEnd != 0) revert ChallengeRunning();
        if (approvedEpoch[msg.sender] == epoch) revert AlreadyApproved();
        if (o == Outcome.Handover && successor == address(0)) revert NoSuccessor();
        approvedEpoch[msg.sender] = epoch;
        votedOutcome[msg.sender] = uint8(o);
        unchecked {
            ++approvalCount;
        }
        uint8 votes = ++_outcomeVotes[epoch][uint8(o)];
        emit GuardianApproved(msg.sender, approvalCount, threshold, epoch);
        emit OutcomeVoted(msg.sender, o);
        if (votes >= threshold) {
            challengeEnd = uint64(block.timestamp) + challengeWindow;
            pendingOutcome = o;
            emit ChallengeStarted(challengeEnd, epoch);
        }
    }

    /// @notice Any single guardian may freeze the agent once the owner is LATE (past the check-in deadline).
    ///         Cleared automatically by any owner activity. Cannot be used while the owner is current or paused.
    function guardianFreezeAgent() external onlyGuardian live {
        if (agent == address(0)) revert NoAgent();
        if (block.timestamp <= expiry()) revert NotYetExpired();
        if (agentGuardianFrozenEpoch == epoch) revert NothingToDo();
        agentGuardianFrozenEpoch = epoch;
        emit AgentFrozen(msg.sender, 1);
    }

    /// @notice Retract a vote — only while the challenge has not started.
    function withdrawApproval() external onlyGuardian live {
        if (challengeEnd != 0) revert ChallengeRunning();
        if (approvedEpoch[msg.sender] != epoch) revert NotApproved();
        approvedEpoch[msg.sender] = 0;
        unchecked {
            --approvalCount;
            --_outcomeVotes[epoch][votedOutcome[msg.sender]];
        }
        emit ApprovalWithdrawn(msg.sender, approvalCount);
    }

    // ──────────────────────────── release ────────────────────────────

    /// @notice Anyone (keeper, heir, guardian) may execute the approved outcome once the challenge window is over:
    ///         Release (all assets to the beneficiary) or Handover (ownership + funds to the successor).
    function executeRelease() external live nonReentrant {
        if (challengeEnd == 0) revert NotYetExpired();
        if (block.timestamp < challengeEnd) revert ChallengeNotOver();
        if (pendingOutcome == Outcome.Handover) _handover();
        else _release(false);
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

    /// @notice Last moment (inclusive) the agent may still spend: expiry + min(lateAllowance, grace).
    function agentCutoff() public view returns (uint64) {
        uint64 late = agentLateAllowance < grace ? agentLateAllowance : grace;
        return expiry() + late;
    }

    function agentState() public view returns (AgentState) {
        if (agent == address(0)) return AgentState.None;
        if (released || closed) return AgentState.Stopped;
        if (agentOwnerFrozen) return AgentState.FrozenByOwner;
        if (agentGuardianFrozenEpoch == epoch) return AgentState.FrozenByGuardian;
        if (challengeEnd != 0 || block.timestamp > agentCutoff()) return AgentState.FrozenLapsed;
        return AgentState.Active;
    }

    /// @notice What the agent could still spend of `asset` right now (ignores frozen state; see agentState()).
    function agentAllowance(address asset) external view returns (uint256 perTx, uint256 remainingInPeriod, uint256 periodResetsAt) {
        AssetLimit memory l = assetLimit[asset];
        perTx = l.perTx;
        uint64 start = periodStart[asset];
        if (l.perTx == 0) return (0, 0, 0);
        if (start == 0 || block.timestamp >= uint256(start) + agentPeriod) return (perTx, l.perPeriod, 0);
        remainingInPeriod = l.perPeriod - periodSpent[asset];
        periodResetsAt = uint256(start) + agentPeriod;
    }

    function agentAssets() external view returns (address[] memory) {
        return _agentAssets;
    }

    function recipients() external view returns (address[] memory) {
        return _recipients;
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
        pendingOutcome = Outcome.Release;
        emit CheckedIn(owner, lastCheckIn, epoch);
        if (hadRelease) emit ReleaseCancelled(epoch);
    }

    /// @dev Ownership + funds stay in the vault; the NEW owner (named in advance by the old one) controls them.
    ///      The agent is revoked and all its limits/allowlist cleared: the successor must re-authorise one.
    function _handover() internal {
        address old = owner;
        address next = successor;
        owner = next;
        successor = address(0);
        _clearAgent();
        pausedUntil = 0;
        pendingOutcome = Outcome.Release;
        lastCheckIn = uint64(block.timestamp);
        unchecked {
            ++epoch;
        }
        approvalCount = 0;
        challengeEnd = 0;
        emit HandedOver(old, next);
        emit CheckedIn(next, lastCheckIn, epoch);
    }

    function _requireFreeRole(address a) internal view {
        if (a == address(0) || a == address(this)) revert ZeroAddress();
        if (a == owner || a == beneficiary || a == agent || a == successor || isGuardian[a]) revert RoleConflict();
    }

    function _resetSpent() internal {
        uint256 n = _agentAssets.length;
        for (uint256 i; i < n; ++i) {
            address a = _agentAssets[i];
            periodStart[a] = 0;
            periodSpent[a] = 0;
        }
    }

    function _dropAsset(address asset) internal {
        delete assetLimit[asset];
        delete periodStart[asset];
        delete periodSpent[asset];
        uint256 n = _agentAssets.length;
        for (uint256 i; i < n; ++i) {
            if (_agentAssets[i] == asset) {
                _agentAssets[i] = _agentAssets[n - 1];
                _agentAssets.pop();
                break;
            }
        }
    }

    function _clearAgent() internal {
        agent = address(0);
        agentPeriod = 0;
        agentLateAllowance = 0;
        agentOwnerFrozen = false;
        uint256 n = _agentAssets.length;
        for (uint256 i; i < n; ++i) {
            address a = _agentAssets[i];
            delete assetLimit[a];
            delete periodStart[a];
            delete periodSpent[a];
        }
        delete _agentAssets;
        n = _recipients.length;
        for (uint256 i; i < n; ++i) {
            isRecipient[_recipients[i]] = false;
        }
        delete _recipients;
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
        if (b == address(0) || b == owner || b == address(this) || b == agent || b == successor) revert BadParams();
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
            if (a == agent || a == successor) revert RoleConflict();
            if (isGuardian[a]) revert AlreadyGuardian();
            isGuardian[a] = true;
            _guardians.push(a);
        }
        threshold = t;
        emit GuardiansUpdated(g, t);
    }
}
