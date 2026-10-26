// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Custos} from "../src/Custos.sol";
import {CustosFactory} from "../src/CustosFactory.sol";
import {DeployRobinhood} from "../script/DeployRobinhood.s.sol";
import "./mocks/Mocks.sol";

/// Robinhood Chain (Arbitrum Nitro / Orbit) behaves differently from Ethereum:
///  - `block.number` is an ESTIMATE OF THE L1 BLOCK NUMBER that updates only periodically (so it can stay constant
///    for many seconds/minutes, and is unrelated to L2 block production);
///  - `block.prevrandao` / `block.difficulty` are constants; `block.coinbase` is the fee account;
///  - 96 KB max contract size (we stay far below even Ethereum's 24 KB);
///  - msg.sender of L1->L2 messages is an aliased address.
/// These tests prove Custos's timing depends ONLY on block.timestamp.
contract RobinhoodChainTest is Test {
    Custos v;
    address owner = makeAddr("owner");
    address heir = makeAddr("heir");
    address g1 = makeAddr("g1");
    address g2 = makeAddr("g2");
    address g3 = makeAddr("g3");

    uint64 constant INTERVAL = 30 days;
    uint64 constant GRACE = 7 days;
    uint64 constant CHALLENGE = 3 days;
    uint64 constant FALLBACK = 30 days;

    function _params() internal view returns (Custos.Params memory p) {
        address[] memory gs = new address[](3);
        gs[0] = g1;
        gs[1] = g2;
        gs[2] = g3;
        p = Custos.Params({
            beneficiary: heir,
            guardians: gs,
            threshold: 2,
            interval: INTERVAL,
            grace: GRACE,
            challengeWindow: CHALLENGE,
            fallbackDelay: FALLBACK
        });
    }

    function setUp() public {
        vm.warp(1_800_000_000);
        vm.roll(1_000);
        vm.prank(owner);
        v = new Custos(owner, _params());
        vm.deal(owner, 100 ether);
        vm.prank(owner);
        (bool ok,) = address(v).call{value: 5 ether}("");
        assertTrue(ok);
    }

    // ───────────── block.number must not move any deadline ─────────────

    /// Huge forward jumps in block.number with NO time passing change nothing.
    function test_hugeBlockJump_doesNotAdvanceTimers() public {
        uint64 exp = v.expiry();
        uint64 ge = v.graceEnd();
        vm.roll(block.number + 1_000_000_000_000); // ~10^12 blocks, ~ millennia of blocks
        assertEq(uint8(v.status()), uint8(Custos.Status.Active));
        assertEq(v.expiry(), exp);
        assertEq(v.graceEnd(), ge);
        // guardians can't approve, nobody can execute or claim early
        vm.prank(g1);
        vm.expectRevert(Custos.NotYetExpired.selector);
        v.approveRelease();
        vm.expectRevert();
        v.executeRelease();
        vm.expectRevert(Custos.FallbackNotAvailable.selector);
        vm.prank(heir);
        v.beneficiaryClaim();
    }

    /// Opposite direction: block.number going BACKWARDS (possible with an estimate) must not break or rewind anything.
    function test_blockNumberGoingBackwards_isHarmless() public {
        vm.warp(block.timestamp + INTERVAL + GRACE + 1);
        vm.roll(1_000_000_000);
        assertEq(uint8(v.status()), uint8(Custos.Status.Grace) + 1); // AwaitingGuardians
        vm.roll(1); // "L1 estimate" regresses
        assertEq(uint8(v.status()), uint8(Custos.Status.Grace) + 1);
        vm.prank(g1);
        v.approveRelease(); // still works
    }

    /// block.number frozen (as an infrequently-updated L1 estimate) while days of real time pass: timers still fire.
    function test_frozenBlockNumber_timersStillFire() public {
        uint256 frozen = block.number;
        vm.warp(block.timestamp + INTERVAL + 1);
        assertEq(block.number, frozen);
        assertEq(uint8(v.status()), uint8(Custos.Status.Grace));
        vm.warp(block.timestamp + GRACE);
        assertEq(block.number, frozen);
        assertEq(uint8(v.status()), uint8(Custos.Status.AwaitingGuardians));
    }

    /// Full lifecycle with block.number wildly jumping between EVERY step (up, down, up). Outcome == pure-timestamp run.
    function test_fullLifecycle_withWildBlockNumbers() public {
        uint256 heirBefore = heir.balance;
        vm.roll(7);
        vm.warp(v.graceEnd() + 1);
        vm.roll(type(uint64).max);
        vm.prank(g1);
        v.approveRelease();
        vm.roll(3);
        vm.prank(g2);
        v.approveRelease();
        assertEq(uint8(v.status()), uint8(Custos.Status.Challenge));
        vm.roll(type(uint128).max); // enormous block jump inside the challenge window: must NOT end it
        vm.expectRevert(Custos.ChallengeNotOver.selector);
        v.executeRelease();
        vm.warp(block.timestamp + CHALLENGE); // exactly challengeEnd by time
        vm.roll(2);
        assertEq(uint8(v.status()), uint8(Custos.Status.Executable));
        v.executeRelease();
        assertEq(heir.balance - heirBefore, 5 ether);
        assertEq(uint8(v.status()), uint8(Custos.Status.Released));
    }

    /// Owner check-in is not affected by block.number either way (cancels a challenge, resets the anchor by TIME).
    function test_checkIn_ignoresBlockNumber() public {
        vm.warp(v.graceEnd() + 1);
        vm.prank(g1);
        v.approveRelease();
        vm.prank(g2);
        v.approveRelease();
        vm.roll(block.number + 5_000_000);
        vm.prank(owner);
        v.checkIn();
        assertEq(v.lastCheckIn(), block.timestamp);
        assertEq(uint8(v.status()), uint8(Custos.Status.Active));
        vm.roll(0);
        assertEq(uint8(v.status()), uint8(Custos.Status.Active));
    }

    /// Fuzz: for ANY block number, status is a pure function of (timestamp, state).
    function testFuzz_statusIndependentOfBlockNumber(uint256 bn, uint256 dt) public {
        dt = bound(dt, 0, 3 * 365 days);
        vm.warp(block.timestamp + dt);
        vm.roll(1_000);
        uint8 s1 = uint8(v.status());
        uint64 e1 = v.expiry();
        uint64 g1End = v.graceEnd();
        vm.roll(bn);
        assertEq(uint8(v.status()), s1);
        assertEq(v.expiry(), e1);
        assertEq(v.graceEnd(), g1End);
    }

    /// Fuzz: vote/challenge timing is block.number-independent: roll arbitrary amounts between guardian votes.
    function testFuzz_challengeEndIsTimestampOnly(uint256 bn1, uint256 bn2) public {
        vm.warp(v.graceEnd() + 1);
        vm.roll(bn1);
        vm.prank(g1);
        v.approveRelease();
        vm.roll(bn2);
        uint256 t = block.timestamp;
        vm.prank(g2);
        v.approveRelease();
        assertEq(v.challengeEnd(), t + CHALLENGE);
    }

    // ───────────── randomness / coinbase / blockhash independence ─────────────

    /// prevrandao, coinbase, blockhash, basefee, chainid are constants/aliases on Arbitrum chains: nothing may depend on them.
    function testFuzz_statusIndependentOfPrevrandaoCoinbaseChainId(uint256 rnd, address cb, uint64 cid, uint64 bf) public {
        cid = uint64(bound(cid, 1, type(uint64).max));
        vm.warp(v.graceEnd() + 1);
        uint8 s1 = uint8(v.status());
        vm.prevrandao(bytes32(rnd));
        vm.coinbase(cb);
        vm.chainId(cid);
        vm.fee(bound(bf, 0, 1000 gwei));
        assertEq(uint8(v.status()), s1);
        vm.prank(g1);
        v.approveRelease(); // voting works identically
        assertTrue(v.hasApproved(g1));
    }

    /// Source-level regression guard: the contracts must never reference L1-estimate / randomness / Arbitrum-specific values.
    function test_sourceDoesNotUseForbiddenGlobals() public view {
        string[4] memory files = [
            "src/Custos.sol", "src/CustosFactory.sol", "src/interfaces/IGuardianStaking.sol", "src/interfaces/IERC20Min.sol"
        ];
        string[9] memory banned = [
            "block.number", "block.prevrandao", "block.difficulty", "block.coinbase", "blockhash(", "tx.origin", "arbBlockNumber", "ArbSys", "gasleft("
        ];
        for (uint256 i; i < files.length; ++i) {
            string memory src = _stripComments(vm.readFile(files[i]));
            for (uint256 j; j < banned.length; ++j) {
                assertFalse(_contains(bytes(src), bytes(banned[j])), string.concat(files[i], " uses ", banned[j]));
            }
        }
        // sanity: the scanner does detect things (and comments are ignored)
        assertTrue(_contains(bytes("x = block.number;"), bytes("block.number")));
        assertFalse(_contains(bytes(_stripComments("// block.number\ny")), bytes("block.number")));
    }

    function _contains(bytes memory h, bytes memory n) internal pure returns (bool) {
        if (n.length == 0 || h.length < n.length) return false;
        for (uint256 i; i + n.length <= h.length; ++i) {
            bool ok = true;
            for (uint256 k; k < n.length; ++k) {
                if (h[i + k] != n[k]) {
                    ok = false;
                    break;
                }
            }
            if (ok) return true;
        }
        return false;
    }

    /// Removes // line comments (incl. /// natspec) and /* ... */ blocks so docs may MENTION block.number.
    function _stripComments(string memory s) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        bytes memory out = new bytes(b.length);
        uint256 n;
        for (uint256 i; i < b.length; ++i) {
            if (b[i] == "/" && i + 1 < b.length && b[i + 1] == "/") {
                while (i < b.length && b[i] != "\n") ++i;
                if (i < b.length) out[n++] = "\n";
            } else if (b[i] == "/" && i + 1 < b.length && b[i + 1] == "*") {
                i += 2;
                while (i + 1 < b.length && !(b[i] == "*" && b[i + 1] == "/")) ++i;
                ++i;
            } else {
                out[n++] = b[i];
            }
        }
        assembly {
            mstore(out, n)
        }
        return string(out);
    }

    // ───────────── size limits / account types ─────────────

    /// 96 KB is the Robinhood limit (24 KB on Ethereum). We keep BOTH contracts under Ethereum's 24 KB so the code stays
    /// portable and deployable with unmodified tooling (forge/anvil enforce 24 KB by default). Needs via_ir (see foundry.toml).
    function test_contractSizes_fitRobinhoodLimits() public {
        CustosFactory f = new CustosFactory();
        assertLt(address(v).code.length, 24_576);
        assertLt(address(f).code.length, 24_576);
        assertLt(type(CustosFactory).creationCode.length, 49_152); // Ethereum initcode limit
        emit log_named_uint("Custos runtime bytes", address(v).code.length);
        emit log_named_uint("CustosFactory runtime bytes", address(f).code.length);
    }

    /// Robinhood Chain has first-class ERC-4337 smart accounts, and L1 contracts reach L2 via ALIASED addresses.
    /// The vault makes no assumption that owner/guardians/beneficiary are EOAs, and never uses tx.origin.
    function test_contractAccounts_workAsOwnerGuardianBeneficiary() public {
        ReceiverContract acct = new ReceiverContract();
        ReceiverContract heirAcct = new ReceiverContract();
        ReceiverContract guard1 = new ReceiverContract();
        ReceiverContract guard2 = new ReceiverContract();
        address[] memory gs = new address[](2);
        gs[0] = address(guard1);
        gs[1] = address(guard2);
        Custos.Params memory p = _params();
        p.beneficiary = address(heirAcct);
        p.guardians = gs;
        p.threshold = 2;
        CustosFactory f = new CustosFactory();
        vm.prank(address(acct)); // a smart-contract wallet as owner
        Custos x = Custos(payable(f.create(p)));
        vm.deal(address(x), 1 ether);
        vm.warp(x.graceEnd() + 1);
        vm.prank(address(guard1));
        x.approveRelease();
        vm.prank(address(guard2));
        x.approveRelease();
        vm.warp(block.timestamp + CHALLENGE);
        x.executeRelease();
        assertEq(address(heirAcct).balance, 1 ether);
    }

    /// Aliased L1 address: an alias is just another address; guardian check is by exact address, so an unaliased L1
    /// address that is NOT a guardian on L2 cannot vote (documented in docs/DEPLOY-ROBINHOOD.md).
    function test_l1AddressWithoutAlias_isNotAGuardian() public {
        address l1Guardian = makeAddr("l1-contract-guardian");
        vm.warp(v.graceEnd() + 1);
        vm.prank(l1Guardian);
        vm.expectRevert(Custos.NotGuardian.selector);
        v.approveRelease();
    }

    // ───────────── deploy script guards (local, no network) ─────────────

    function test_deployScript_runsOnTestnetChainId() public {
        vm.chainId(46630);
        DeployRobinhood d = new DeployRobinhood();
        CustosFactory f = d.run();
        assertGt(address(f).code.length, 0);
    }

    function test_deployScript_mainnetNeedsExplicitConfirmation() public {
        vm.chainId(4663);
        DeployRobinhood d = new DeployRobinhood();
        vm.expectRevert(DeployRobinhood.MainnetNotConfirmed.selector);
        d.run();
        vm.setEnv("CUSTOS_MAINNET_OK", "yes");
        CustosFactory f = d.run(); // allowed once the operator confirmed (still simulation inside forge test)
        assertGt(address(f).code.length, 0);
        vm.setEnv("CUSTOS_MAINNET_OK", "");
    }

    function test_deployScript_refusesUnknownChains() public {
        DeployRobinhood d = new DeployRobinhood();
        uint256[4] memory ids = [uint256(1), 143, 42161, 8453]; // Ethereum, Monad, Arbitrum One, Base
        for (uint256 i; i < ids.length; ++i) {
            vm.chainId(ids[i]);
            vm.expectRevert(abi.encodeWithSelector(DeployRobinhood.UnsupportedChain.selector, ids[i]));
            d.run();
        }
    }
}

contract ReceiverContract {
    receive() external payable {}
}
