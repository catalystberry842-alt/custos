// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Heirloom} from "../src/Heirloom.sol";
import {HeirloomFactory} from "../src/HeirloomFactory.sol";
import "./mocks/Mocks.sol";

contract HeirloomBase is Test {
    Heirloom v;
    address owner = makeAddr("owner");
    address heir = makeAddr("heir");
    address g1 = makeAddr("g1");
    address g2 = makeAddr("g2");
    address g3 = makeAddr("g3");
    address rando = makeAddr("rando");

    uint64 constant INTERVAL = 30 days;
    uint64 constant GRACE = 7 days;
    uint64 constant CHALLENGE = 3 days;
    uint64 constant FALLBACK = 30 days;

    uint256 t0;

    function params() internal view returns (Heirloom.Params memory p) {
        address[] memory gs = new address[](3);
        gs[0] = g1;
        gs[1] = g2;
        gs[2] = g3;
        p = Heirloom.Params({
            beneficiary: heir,
            guardians: gs,
            threshold: 2,
            interval: INTERVAL,
            grace: GRACE,
            challengeWindow: CHALLENGE,
            fallbackDelay: FALLBACK
        });
    }

    function setUp() public virtual {
        vm.warp(1_700_000_000);
        t0 = block.timestamp;
        vm.prank(owner);
        v = new Heirloom(owner, params());
        vm.deal(owner, 1000 ether);
        vm.prank(owner);
        (bool ok,) = address(v).call{value: 10 ether}("");
        assertTrue(ok);
    }

    function _toGraceEnd() internal {
        vm.warp(uint256(v.graceEnd()) + 1);
    }

    function _vote2() internal {
        vm.prank(g1);
        v.approveRelease();
        vm.prank(g2);
        v.approveRelease();
    }
}

contract HeirloomConfigTest is HeirloomBase {
    function test_constructorState() public view {
        assertEq(v.owner(), owner);
        assertEq(v.beneficiary(), heir);
        assertEq(v.threshold(), 2);
        assertEq(v.guardianCount(), 3);
        assertEq(v.interval(), INTERVAL);
        assertEq(v.grace(), GRACE);
        assertEq(v.challengeWindow(), CHALLENGE);
        assertEq(v.lastCheckIn(), t0);
        assertEq(uint8(v.status()), uint8(Heirloom.Status.Active));
        assertTrue(v.isGuardian(g1) && v.isGuardian(g2) && v.isGuardian(g3));
    }

    function test_constructor_revertsOnBadParams() public {
        Heirloom.Params memory p = params();
        p.threshold = 0;
        vm.expectRevert(Heirloom.BadParams.selector);
        new Heirloom(owner, p);

        p = params();
        p.threshold = 4;
        vm.expectRevert(Heirloom.BadParams.selector);
        new Heirloom(owner, p);

        p = params();
        p.interval = 1 hours;
        vm.expectRevert(Heirloom.BadParams.selector);
        new Heirloom(owner, p);

        p = params();
        p.grace = 0;
        vm.expectRevert(Heirloom.BadParams.selector);
        new Heirloom(owner, p);

        p = params();
        p.challengeWindow = 1 hours;
        vm.expectRevert(Heirloom.BadParams.selector);
        new Heirloom(owner, p);

        p = params();
        p.fallbackDelay = 1 days; // below MIN_FALLBACK but non-zero
        vm.expectRevert(Heirloom.BadParams.selector);
        new Heirloom(owner, p);

        p = params();
        p.beneficiary = owner;
        vm.expectRevert(Heirloom.BadParams.selector);
        new Heirloom(owner, p);

        p = params();
        p.beneficiary = address(0);
        vm.expectRevert(Heirloom.BadParams.selector);
        new Heirloom(owner, p);

        p = params();
        p.guardians = new address[](0);
        vm.expectRevert(Heirloom.BadParams.selector);
        new Heirloom(owner, p);
    }

    function test_constructor_guardianValidation() public {
        Heirloom.Params memory p = params();
        p.guardians[1] = p.guardians[0]; // duplicate
        vm.expectRevert(Heirloom.AlreadyGuardian.selector);
        new Heirloom(owner, p);

        p = params();
        p.guardians[0] = owner; // owner cannot be guardian
        vm.expectRevert(Heirloom.ZeroAddress.selector);
        new Heirloom(owner, p);

        p = params();
        p.guardians[2] = address(0);
        vm.expectRevert(Heirloom.ZeroAddress.selector);
        new Heirloom(owner, p);

        p = params();
        p.guardians = new address[](11);
        for (uint256 i; i < 11; i++) {
            p.guardians[i] = address(uint160(0x1000 + i));
        }
        vm.expectRevert(Heirloom.BadParams.selector);
        new Heirloom(owner, p);
    }

    function test_fallbackCanBeDisabled() public {
        Heirloom.Params memory p = params();
        p.fallbackDelay = 0;
        Heirloom x = new Heirloom(owner, p);
        assertEq(x.fallbackDelay(), 0);
    }

    function test_setBeneficiary_onlyOwner_andTouches() public {
        address newHeir = makeAddr("newHeir");
        vm.prank(rando);
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.setBeneficiary(newHeir);

        vm.prank(g1);
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.setBeneficiary(newHeir);

        vm.warp(t0 + 5 days);
        vm.expectEmit(true, true, false, false);
        emit Heirloom.BeneficiaryChanged(heir, newHeir);
        vm.prank(owner);
        v.setBeneficiary(newHeir);
        assertEq(v.beneficiary(), newHeir);
        assertEq(v.lastCheckIn(), t0 + 5 days);

        vm.prank(owner);
        vm.expectRevert(Heirloom.BadParams.selector);
        v.setBeneficiary(owner);
        vm.prank(owner);
        vm.expectRevert(Heirloom.BadParams.selector);
        v.setBeneficiary(address(0));
        vm.prank(owner);
        vm.expectRevert(Heirloom.BadParams.selector);
        v.setBeneficiary(address(v));
    }

    function test_setTimings() public {
        vm.prank(owner);
        v.setTimings(60 days, 10 days, 5 days, 0);
        assertEq(v.interval(), 60 days);
        assertEq(v.grace(), 10 days);
        assertEq(v.challengeWindow(), 5 days);
        assertEq(v.fallbackDelay(), 0);

        vm.prank(rando);
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.setTimings(60 days, 10 days, 5 days, 0);

        vm.prank(owner);
        vm.expectRevert(Heirloom.BadParams.selector);
        v.setTimings(1 hours, 10 days, 5 days, 0);
    }

    function test_setGuardians_replacesWholeSet() public {
        address a = makeAddr("a");
        address b = makeAddr("b");
        address[] memory gs = new address[](2);
        gs[0] = a;
        gs[1] = b;
        vm.prank(owner);
        v.setGuardians(gs, 2);
        assertFalse(v.isGuardian(g1));
        assertFalse(v.isGuardian(g2));
        assertTrue(v.isGuardian(a));
        assertEq(v.threshold(), 2);
        assertEq(v.guardianCount(), 2);

        vm.prank(rando);
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.setGuardians(gs, 1);
    }

    // ───── guardian replacement ─────
    function test_replaceGuardian() public {
        address n = makeAddr("newG");
        vm.expectEmit(true, true, false, false);
        emit Heirloom.GuardianReplaced(g3, n);
        vm.prank(owner);
        v.replaceGuardian(g3, n);
        assertFalse(v.isGuardian(g3));
        assertTrue(v.isGuardian(n));
        address[] memory gs = v.guardians();
        assertEq(gs[2], n);
        assertEq(v.threshold(), 2);
    }

    function test_replaceGuardian_reverts() public {
        vm.startPrank(owner);
        vm.expectRevert(Heirloom.NotAGuardian.selector);
        v.replaceGuardian(rando, makeAddr("x"));
        vm.expectRevert(Heirloom.AlreadyGuardian.selector);
        v.replaceGuardian(g1, g2);
        vm.expectRevert(Heirloom.ZeroAddress.selector);
        v.replaceGuardian(g1, address(0));
        vm.expectRevert(Heirloom.ZeroAddress.selector);
        v.replaceGuardian(g1, owner);
        vm.stopPrank();

        vm.prank(g1);
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.replaceGuardian(g1, makeAddr("x"));
    }

    function test_replacedGuardianCannotVote_newCan() public {
        _toGraceEnd();
        address n = makeAddr("newG");
        vm.prank(owner);
        v.replaceGuardian(g3, n); // owner is alive → touch → timer reset
        vm.prank(g3);
        vm.expectRevert(Heirloom.NotGuardian.selector);
        v.approveRelease();

        _toGraceEnd();
        vm.prank(n);
        v.approveRelease();
        assertTrue(v.hasApproved(n));
    }

    function test_replacingGuardianVoidsTheirVote() public {
        _toGraceEnd();
        vm.prank(g1);
        v.approveRelease();
        assertEq(v.approvalCount(), 1);
        vm.prank(owner);
        v.replaceGuardian(g1, makeAddr("n1"));
        assertEq(v.approvalCount(), 0);
        assertFalse(v.hasApproved(g1));
    }
}

contract HeirloomTimelineTest is HeirloomBase {
    function test_statusProgression() public {
        assertEq(uint8(v.status()), uint8(Heirloom.Status.Active));
        vm.warp(t0 + INTERVAL);
        assertEq(uint8(v.status()), uint8(Heirloom.Status.Active)); // boundary inclusive
        vm.warp(t0 + INTERVAL + 1);
        assertEq(uint8(v.status()), uint8(Heirloom.Status.Grace));
        vm.warp(t0 + INTERVAL + GRACE);
        assertEq(uint8(v.status()), uint8(Heirloom.Status.Grace));
        vm.warp(t0 + INTERVAL + GRACE + 1);
        assertEq(uint8(v.status()), uint8(Heirloom.Status.AwaitingGuardians));
        _vote2();
        assertEq(uint8(v.status()), uint8(Heirloom.Status.Challenge));
        vm.warp(block.timestamp + CHALLENGE);
        assertEq(uint8(v.status()), uint8(Heirloom.Status.Executable));
        v.executeRelease();
        assertEq(uint8(v.status()), uint8(Heirloom.Status.Released));
    }

    function test_checkIn_resetsTimer_emits() public {
        vm.warp(t0 + 20 days);
        vm.expectEmit(true, false, false, true);
        emit Heirloom.CheckedIn(owner, uint64(t0 + 20 days), 2);
        vm.prank(owner);
        v.checkIn();
        assertEq(v.lastCheckIn(), t0 + 20 days);
        assertEq(v.expiry(), t0 + 20 days + INTERVAL);
        // old deadline no longer matters
        vm.warp(t0 + INTERVAL + GRACE + 1);
        assertEq(uint8(v.status()), uint8(Heirloom.Status.Active));
    }

    function test_checkIn_onlyOwner() public {
        vm.prank(rando);
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.checkIn();
        vm.prank(g1);
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.checkIn();
        vm.prank(heir);
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.checkIn();
    }

    // ───── guardian collusion ─────
    function test_collusionBeforeExpiry_fails() public {
        vm.startPrank(g1);
        vm.expectRevert(Heirloom.NotYetExpired.selector);
        v.approveRelease();
        vm.stopPrank();
        vm.prank(g2);
        vm.expectRevert(Heirloom.NotYetExpired.selector);
        v.approveRelease();
        vm.prank(g3);
        vm.expectRevert(Heirloom.NotYetExpired.selector);
        v.approveRelease();
        assertEq(v.approvalCount(), 0);
        assertEq(v.challengeEnd(), 0);
        vm.expectRevert(Heirloom.NotYetExpired.selector);
        v.executeRelease();
    }

    function test_collusionDuringGrace_fails() public {
        vm.warp(t0 + INTERVAL + 1);
        vm.prank(g1);
        vm.expectRevert(Heirloom.NotYetExpired.selector);
        v.approveRelease();
        vm.warp(t0 + INTERVAL + GRACE); // exactly graceEnd → still too early
        vm.prank(g2);
        vm.expectRevert(Heirloom.NotYetExpired.selector);
        v.approveRelease();
        assertEq(address(heir).balance, 0);
    }

    function test_allGuardiansCollude_cannotSkipChallengeWindow() public {
        _toGraceEnd();
        vm.prank(g1);
        v.approveRelease();
        vm.prank(g2);
        v.approveRelease();
        vm.prank(g3);
        vm.expectRevert(Heirloom.ChallengeRunning.selector);
        v.approveRelease();
        vm.expectRevert(Heirloom.ChallengeNotOver.selector);
        v.executeRelease();
        assertEq(heir.balance, 0);
        assertEq(address(v).balance, 10 ether);
    }

    function test_guardiansCannotMoveFundsOrChangeConfig() public {
        _toGraceEnd();
        vm.startPrank(g1);
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.withdrawNative(1 ether);
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.setBeneficiary(g1);
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.closeVault();
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.setGuardians(new address[](0), 0);
        vm.expectRevert(Heirloom.NotBeneficiary.selector);
        v.beneficiaryClaim();
        vm.stopPrank();
    }

    function test_nonGuardianCannotVote() public {
        _toGraceEnd();
        vm.prank(rando);
        vm.expectRevert(Heirloom.NotGuardian.selector);
        v.approveRelease();
        vm.prank(heir);
        vm.expectRevert(Heirloom.NotGuardian.selector);
        v.approveRelease();
        vm.prank(owner);
        vm.expectRevert(Heirloom.NotGuardian.selector);
        v.approveRelease();
    }

    function test_belowThresholdDoesNotStartChallenge() public {
        _toGraceEnd();
        vm.prank(g1);
        v.approveRelease();
        assertEq(v.approvalCount(), 1);
        assertEq(v.challengeEnd(), 0);
        assertEq(uint8(v.status()), uint8(Heirloom.Status.AwaitingGuardians));
        vm.warp(block.timestamp + 365 days);
        vm.expectRevert(Heirloom.NotYetExpired.selector); // no challenge started
        v.executeRelease();
    }

    // ───── double vote ─────
    function test_doubleVote_reverts() public {
        _toGraceEnd();
        vm.prank(g1);
        v.approveRelease();
        vm.prank(g1);
        vm.expectRevert(Heirloom.AlreadyApproved.selector);
        v.approveRelease();
        assertEq(v.approvalCount(), 1);
        assertEq(v.challengeEnd(), 0); // one guardian cannot hit threshold of 2 alone
    }

    function test_withdrawApproval_thenRevote() public {
        _toGraceEnd();
        vm.prank(g1);
        v.approveRelease();
        vm.prank(g1);
        v.withdrawApproval();
        assertEq(v.approvalCount(), 0);
        vm.prank(g1);
        vm.expectRevert(Heirloom.NotApproved.selector);
        v.withdrawApproval();
        vm.prank(g1);
        v.approveRelease();
        assertEq(v.approvalCount(), 1);
    }

    function test_cannotWithdrawApprovalAfterChallengeStarted() public {
        _toGraceEnd();
        _vote2();
        vm.prank(g1);
        vm.expectRevert(Heirloom.ChallengeRunning.selector);
        v.withdrawApproval();
    }

    // ───── owner returns ─────
    function test_ownerReturnsDuringChallenge_cancels() public {
        _toGraceEnd();
        _vote2();
        assertEq(uint8(v.status()), uint8(Heirloom.Status.Challenge));
        vm.warp(block.timestamp + 1 days);

        vm.expectEmit(false, false, false, true);
        emit Heirloom.ReleaseCancelled(v.epoch() + 1);
        vm.prank(owner);
        v.checkIn();

        assertEq(uint8(v.status()), uint8(Heirloom.Status.Active));
        assertEq(v.approvalCount(), 0);
        assertEq(v.challengeEnd(), 0);
        assertFalse(v.hasApproved(g1));

        vm.warp(block.timestamp + 10 days);
        vm.expectRevert(Heirloom.NotYetExpired.selector);
        v.executeRelease();
        assertEq(heir.balance, 0);
        assertEq(address(v).balance, 10 ether);
    }

    function test_ownerReturnsAfterChallengeOver_butBeforeExecution_stillCancels() public {
        _toGraceEnd();
        _vote2();
        vm.warp(block.timestamp + CHALLENGE + 5 days);
        assertEq(uint8(v.status()), uint8(Heirloom.Status.Executable));
        vm.prank(owner);
        v.checkIn();
        vm.expectRevert(Heirloom.NotYetExpired.selector);
        v.executeRelease();
        assertEq(heir.balance, 0);
    }

    function test_cancelRelease_requiresActiveRelease() public {
        vm.prank(owner);
        vm.expectRevert(Heirloom.NothingToDo.selector);
        v.cancelRelease();

        _toGraceEnd();
        vm.prank(g1);
        v.approveRelease();
        vm.prank(owner);
        v.cancelRelease(); // cancels even a partial vote
        assertEq(v.approvalCount(), 0);
    }

    function test_staleVotesDoNotCarryOver() public {
        _toGraceEnd();
        vm.prank(g1);
        v.approveRelease();
        vm.prank(owner);
        v.checkIn();
        // g2 alone after the next expiry must not complete a threshold with g1's old vote
        _toGraceEnd();
        vm.prank(g2);
        v.approveRelease();
        assertEq(v.approvalCount(), 1);
        assertEq(v.challengeEnd(), 0);
        // g1 can vote again in the new epoch
        vm.prank(g1);
        v.approveRelease();
        assertEq(v.approvalCount(), 2);
        assertTrue(v.challengeEnd() != 0);
    }

    function test_afterCancel_fullCycleStillWorks() public {
        _toGraceEnd();
        _vote2();
        vm.prank(owner);
        v.checkIn();
        _toGraceEnd();
        _vote2();
        vm.warp(block.timestamp + CHALLENGE);
        v.executeRelease();
        assertEq(heir.balance, 10 ether);
    }

    // ───── execute ─────
    function test_execute_paysBeneficiaryOnly_anyoneCanCall() public {
        _toGraceEnd();
        _vote2();
        vm.warp(block.timestamp + CHALLENGE);
        vm.expectEmit(true, false, false, true);
        emit Heirloom.Released(heir, 10 ether, false);
        vm.prank(rando);
        v.executeRelease();
        assertEq(heir.balance, 10 ether);
        assertEq(address(v).balance, 0);
        assertTrue(v.released());
        assertEq(v.payout(), heir);
    }

    function test_executeBeforeChallengeEnd_reverts() public {
        _toGraceEnd();
        _vote2();
        vm.warp(block.timestamp + CHALLENGE - 1);
        vm.expectRevert(Heirloom.ChallengeNotOver.selector);
        v.executeRelease();
    }

    function test_releaseIsTerminal() public {
        _toGraceEnd();
        _vote2();
        vm.warp(block.timestamp + CHALLENGE);
        v.executeRelease();

        vm.startPrank(owner);
        vm.expectRevert(Heirloom.Finished.selector);
        v.checkIn();
        vm.expectRevert(Heirloom.Finished.selector);
        v.withdrawNative(1);
        vm.expectRevert(Heirloom.Finished.selector);
        v.setBeneficiary(rando);
        vm.expectRevert(Heirloom.Finished.selector);
        v.closeVault();
        vm.expectRevert(Heirloom.Finished.selector);
        v.pause(1 days);
        vm.stopPrank();
        vm.prank(g3);
        vm.expectRevert(Heirloom.Finished.selector);
        v.approveRelease();
        vm.expectRevert(Heirloom.Finished.selector);
        v.executeRelease();
    }

    // ───── fallback ─────
    function test_fallback_beneficiaryClaimsWhenGuardiansVanish() public {
        vm.warp(v.fallbackOpensAt());
        vm.prank(heir);
        vm.expectRevert(Heirloom.FallbackNotAvailable.selector);
        v.beneficiaryClaim();

        vm.warp(v.fallbackOpensAt() + 1);
        vm.prank(rando);
        vm.expectRevert(Heirloom.NotBeneficiary.selector);
        v.beneficiaryClaim();

        vm.expectEmit(true, false, false, true);
        emit Heirloom.Released(heir, 10 ether, true);
        vm.prank(heir);
        v.beneficiaryClaim();
        assertEq(heir.balance, 10 ether);
    }

    function test_fallback_notBeforeGrace() public {
        vm.warp(t0 + INTERVAL + GRACE + 1);
        vm.prank(heir);
        vm.expectRevert(Heirloom.FallbackNotAvailable.selector);
        v.beneficiaryClaim();
    }

    function test_fallback_ownerCheckInStopsIt() public {
        vm.warp(v.fallbackOpensAt() + 1);
        vm.prank(owner);
        v.checkIn();
        vm.prank(heir);
        vm.expectRevert(Heirloom.FallbackNotAvailable.selector);
        v.beneficiaryClaim();
    }

    function test_fallback_disabledWhenZero() public {
        vm.prank(owner);
        v.setTimings(INTERVAL, GRACE, CHALLENGE, 0);
        vm.warp(block.timestamp + 5 * 365 days);
        vm.prank(heir);
        vm.expectRevert(Heirloom.FallbackNotAvailable.selector);
        v.beneficiaryClaim();
    }

    // ───── pause / vacation mode ─────
    function test_pause_extendsDeadline_andBlocksGuardians() public {
        vm.prank(owner);
        v.pause(60 days);
        assertEq(uint8(v.status()), uint8(Heirloom.Status.Paused));
        vm.warp(t0 + 100 days); // would be way past plain expiry
        // pausedUntil = t0+60d; expiry = t0+90d; graceEnd = t0+97d
        assertEq(uint8(v.status()), uint8(Heirloom.Status.AwaitingGuardians));
        vm.warp(t0 + 60 days - 1);
        vm.prank(g1);
        vm.expectRevert(Heirloom.NotYetExpired.selector);
        v.approveRelease();
        assertEq(uint8(v.status()), uint8(Heirloom.Status.Paused));
    }

    function test_pause_deadOwnerCannotLockForever() public {
        vm.prank(owner);
        v.pause(90 days);
        // dead: nothing else happens. After pausedUntil + interval + grace guardians can act.
        vm.warp(t0 + 90 days + INTERVAL + GRACE);
        vm.prank(g1);
        vm.expectRevert(Heirloom.NotYetExpired.selector);
        v.approveRelease();
        vm.warp(block.timestamp + 1);
        vm.prank(g1);
        v.approveRelease();
        vm.prank(g2);
        v.approveRelease();
        vm.warp(block.timestamp + CHALLENGE);
        v.executeRelease();
        assertEq(heir.balance, 10 ether);
    }

    function test_pause_bounds() public {
        vm.startPrank(owner);
        vm.expectRevert(Heirloom.BadParams.selector);
        v.pause(0);
        vm.expectRevert(Heirloom.BadParams.selector);
        v.pause(91 days);
        vm.stopPrank();
        vm.prank(rando);
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.pause(1 days);
    }

    function test_unpause_restartsTimer() public {
        vm.prank(owner);
        v.pause(60 days);
        vm.warp(t0 + 10 days);
        vm.prank(owner);
        v.unpause();
        assertEq(v.pausedUntil(), 0);
        assertEq(v.anchor(), t0 + 10 days);
        assertEq(uint8(v.status()), uint8(Heirloom.Status.Active));
        vm.prank(owner);
        vm.expectRevert(Heirloom.NothingToDo.selector);
        v.unpause();
    }

    function test_pauseDuringChallenge_cancels() public {
        _toGraceEnd();
        _vote2();
        vm.prank(owner);
        v.pause(10 days);
        assertEq(v.challengeEnd(), 0);
        assertEq(v.approvalCount(), 0);
    }
}

contract HeirloomAssetsTest is HeirloomBase {
    MockERC20 tok;

    function setUp() public override {
        super.setUp();
        tok = new MockERC20();
        tok.mint(owner, 1000e18);
    }

    function test_depositAndWithdrawNative() public {
        vm.warp(t0 + 10 days);
        vm.prank(owner);
        v.withdrawNative(4 ether);
        assertEq(address(v).balance, 6 ether);
        assertEq(owner.balance, 994 ether);
        assertEq(v.lastCheckIn(), t0 + 10 days); // withdraw counts as proof of life
    }

    function test_withdrawNative_onlyOwner() public {
        vm.prank(rando);
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.withdrawNative(1);
        vm.prank(heir);
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.withdrawNative(1);
        vm.prank(owner);
        vm.expectRevert(Heirloom.TransferFailedErr.selector);
        v.withdrawNative(11 ether);
    }

    function test_depositToken_listsAndPulls() public {
        vm.startPrank(owner);
        tok.approve(address(v), 100e18);
        v.depositToken(address(tok), 100e18);
        vm.stopPrank();
        assertEq(tok.balanceOf(address(v)), 100e18);
        assertTrue(v.isToken(address(tok)));
        assertEq(v.tokens().length, 1);
    }

    function test_depositToken_onlyOwner_noPullFromOthers() public {
        tok.mint(rando, 10e18);
        vm.startPrank(rando);
        tok.approve(address(v), 10e18);
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.depositToken(address(tok), 10e18);
        vm.stopPrank();
    }

    function test_withdrawToken() public {
        vm.startPrank(owner);
        tok.approve(address(v), 100e18);
        v.depositToken(address(tok), 100e18);
        v.withdrawToken(address(tok), 40e18);
        vm.stopPrank();
        assertEq(tok.balanceOf(owner), 940e18);
        assertEq(tok.balanceOf(address(v)), 60e18);
        vm.prank(rando);
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.withdrawToken(address(tok), 1);
    }

    function test_addRemoveToken() public {
        vm.startPrank(owner);
        v.addToken(address(tok));
        vm.expectRevert(Heirloom.TokenAlreadyListed.selector);
        v.addToken(address(tok));
        v.removeToken(address(tok));
        vm.expectRevert(Heirloom.TokenNotListed.selector);
        v.removeToken(address(tok));
        vm.expectRevert(Heirloom.ZeroAddress.selector);
        v.addToken(address(0));
        vm.expectRevert(Heirloom.ZeroAddress.selector);
        v.addToken(rando); // EOA, not a contract
        vm.stopPrank();
    }

    function test_tokenCap() public {
        vm.startPrank(owner);
        for (uint256 i; i < 32; i++) {
            v.addToken(address(new MockERC20()));
        }
        MockERC20 extra = new MockERC20();
        vm.expectRevert(Heirloom.TooManyTokens.selector);
        v.addToken(address(extra));
        vm.stopPrank();
    }

    function test_releaseSendsNativeAndTokens() public {
        MockERC20 tok2 = new MockERC20();
        NoReturnToken usdtLike = new NoReturnToken();
        tok2.mint(owner, 5e18);
        usdtLike.mint(address(v), 7e6);
        vm.startPrank(owner);
        tok.approve(address(v), 100e18);
        v.depositToken(address(tok), 100e18);
        tok2.approve(address(v), 5e18);
        v.depositToken(address(tok2), 5e18);
        v.addToken(address(usdtLike));
        vm.stopPrank();

        _toGraceEnd();
        _vote2();
        vm.warp(block.timestamp + CHALLENGE);
        v.executeRelease();

        assertEq(heir.balance, 10 ether);
        assertEq(tok.balanceOf(heir), 100e18);
        assertEq(tok2.balanceOf(heir), 5e18);
        assertEq(usdtLike.balanceOf(heir), 7e6);
        assertEq(tok.balanceOf(address(v)), 0);
    }

    function test_sweep_forwardsLateDepositsAndUnlistedTokens() public {
        _toGraceEnd();
        _vote2();
        vm.warp(block.timestamp + CHALLENGE);
        v.executeRelease();

        // someone sends MON and an unlisted token afterwards
        vm.deal(rando, 3 ether);
        vm.prank(rando);
        (bool ok,) = address(v).call{value: 3 ether}("");
        assertTrue(ok);
        tok.mint(address(v), 9e18);

        vm.prank(rando);
        v.sweep();
        assertEq(heir.balance, 13 ether);
        v.sweepToken(address(tok));
        assertEq(tok.balanceOf(heir), 9e18);
        vm.expectRevert(Heirloom.NothingToDo.selector);
        v.sweepToken(address(tok));
    }

    function test_sweep_beforeFinished_reverts() public {
        vm.expectRevert(Heirloom.NotFinished.selector);
        v.sweep();
        vm.expectRevert(Heirloom.NotFinished.selector);
        v.sweepToken(address(tok));
    }

    function test_closeVault_returnsEverythingToOwner() public {
        vm.startPrank(owner);
        tok.approve(address(v), 100e18);
        v.depositToken(address(tok), 100e18);
        uint256 beforeBal = owner.balance;
        v.closeVault();
        vm.stopPrank();
        assertEq(owner.balance, beforeBal + 10 ether);
        assertEq(tok.balanceOf(owner), 1000e18);
        assertTrue(v.closed());
        assertEq(uint8(v.status()), uint8(Heirloom.Status.Closed));
        // dead switch: guardians can't do anything, ever
        vm.warp(block.timestamp + 10 * 365 days);
        vm.prank(g1);
        vm.expectRevert(Heirloom.Finished.selector);
        v.approveRelease();
        vm.prank(heir);
        vm.expectRevert(Heirloom.Finished.selector);
        v.beneficiaryClaim();
        // later strays go to the owner, not the heir
        vm.deal(rando, 1 ether);
        vm.prank(rando);
        (bool ok,) = address(v).call{value: 1 ether}("");
        assertTrue(ok);
        v.sweep();
        assertEq(heir.balance, 0);
    }

    function test_redirectPayout_forRejectingBeneficiary() public {
        PickyBeneficiary picky = new PickyBeneficiary();
        Heirloom.Params memory p = params();
        p.beneficiary = address(picky);
        vm.prank(owner);
        Heirloom x = new Heirloom(owner, p);
        vm.deal(address(x), 5 ether);

        vm.warp(x.graceEnd() + 1);
        vm.prank(g1);
        x.approveRelease();
        vm.prank(g2);
        x.approveRelease();
        vm.warp(block.timestamp + CHALLENGE);
        x.executeRelease(); // does NOT revert even though MON transfer fails
        assertTrue(x.released());
        assertEq(address(x).balance, 5 ether); // stuck for now

        address safe = makeAddr("safeWallet");
        vm.prank(rando);
        vm.expectRevert(Heirloom.NotBeneficiary.selector);
        x.redirectPayout(safe);

        vm.expectRevert(Heirloom.ZeroAddress.selector);
        picky.redirect(x, address(0));
        picky.redirect(x, safe);
        x.sweep();
        assertEq(safe.balance, 5 ether);
    }

    function test_redirectPayout_beforeRelease_reverts() public {
        vm.prank(heir);
        vm.expectRevert(Heirloom.NotFinished.selector);
        v.redirectPayout(rando);
    }
}

contract HeirloomHostileTest is HeirloomBase {
    function _release(Heirloom x) internal {
        vm.warp(x.graceEnd() + 1);
        vm.prank(g1);
        x.approveRelease();
        vm.prank(g2);
        x.approveRelease();
        vm.warp(block.timestamp + CHALLENGE);
        x.executeRelease();
    }

    function test_hostileTokensCannotBlockRelease() public {
        MockERC20 good = new MockERC20();
        RevertingToken rev = new RevertingToken();
        GasBombToken bomb = new GasBombToken();
        ReturnBombToken rb = new ReturnBombToken();
        FalseToken fal = new FalseToken();
        MockERC20 good2 = new MockERC20();
        address[6] memory ts = [address(rev), address(bomb), address(good), address(rb), address(fal), address(good2)];
        for (uint256 i; i < ts.length; i++) {
            MockERC20(ts[i]).mint(address(v), 100);
        }
        vm.startPrank(owner);
        for (uint256 i; i < ts.length; i++) {
            v.addToken(ts[i]);
        }
        vm.stopPrank();

        vm.warp(v.graceEnd() + 1);
        vm.prank(g1);
        v.approveRelease();
        vm.prank(g2);
        v.approveRelease();
        vm.warp(block.timestamp + CHALLENGE);
        uint256 gasBefore = gasleft();
        v.executeRelease();
        uint256 used = gasBefore - gasleft();
        assertLt(used, 3_000_000, "bounded gas");

        assertEq(heir.balance, 10 ether);
        assertEq(good.balanceOf(heir), 100);
        assertEq(good2.balanceOf(heir), 100);
        assertEq(rev.balanceOf(heir), 0);
        assertTrue(v.released());
    }

    function test_gasBombBeneficiary_doesNotBlockRelease() public {
        GasBombBeneficiary gb = new GasBombBeneficiary();
        Heirloom.Params memory p = params();
        p.beneficiary = address(gb);
        Heirloom x = new Heirloom(owner, p);
        vm.deal(address(x), 2 ether);
        MockERC20 good = new MockERC20();
        good.mint(address(x), 55);
        vm.prank(owner);
        x.addToken(address(good));
        _release(x);
        assertTrue(x.released());
        assertEq(good.balanceOf(address(gb)), 55); // tokens still delivered
        assertEq(address(x).balance, 2 ether); // MON stuck until redirect
    }

    // ───── reentrancy ─────
    function test_reentrancy_viaBeneficiaryReceiveHook() public {
        ReentrantBeneficiary rb = new ReentrantBeneficiary();
        Heirloom.Params memory p = params();
        p.beneficiary = address(rb);
        Heirloom x = new Heirloom(owner, p);
        rb.setVault(x);
        vm.deal(address(x), 8 ether);
        _release(x);
        assertEq(rb.attempts(), 1, "hook ran once");
        assertEq(rb.succeeded(), 0, "no reentrant call succeeded");
        assertEq(address(rb).balance, 8 ether, "paid exactly once");
        assertEq(address(x).balance, 0);
    }

    function test_reentrancy_viaMaliciousToken() public {
        ReentrantToken rt = new ReentrantToken();
        Heirloom x = new Heirloom(owner, params());
        rt.setVault(x);
        rt.mint(address(x), 1000);
        vm.deal(address(x), 4 ether);
        vm.prank(owner);
        x.addToken(address(rt));
        _release(x);
        assertEq(rt.attempts(), 1);
        assertEq(rt.succeeded(), 0);
        assertEq(rt.balanceOf(heir), 1000);
        assertEq(heir.balance, 4 ether);
    }

    function test_reentrancy_ownerContractCannotReenterWithdraw() public {
        ReentrantOwner ro = new ReentrantOwner();
        Heirloom.Params memory p = params();
        Heirloom x = new Heirloom(address(ro), p);
        ro.setVault(x);
        vm.deal(address(x), 5 ether);
        ro.arm();
        ro.withdraw(1 ether);
        assertEq(ro.reenterSucceeded(), 0);
        assertEq(address(x).balance, 4 ether); // only the single withdrawal left the vault
        assertEq(address(ro).balance, 1 ether);
    }

    function test_doubleExecute_reverts() public {
        _release(v);
        vm.expectRevert(Heirloom.Finished.selector);
        v.executeRelease();
        assertEq(heir.balance, 10 ether);
    }
}

contract HeirloomFuzzTest is HeirloomBase {
    /// No matter how many guardians vote and when, nothing releases before graceEnd.
    function testFuzz_noReleaseBeforeGraceEnd(uint256 dt, uint8 voters) public {
        dt = bound(dt, 0, uint256(INTERVAL) + GRACE);
        vm.warp(t0 + dt);
        address[3] memory gs = [g1, g2, g3];
        voters = uint8(bound(voters, 0, 3));
        for (uint256 i; i < voters; i++) {
            vm.prank(gs[i]);
            vm.expectRevert(Heirloom.NotYetExpired.selector);
            v.approveRelease();
        }
        vm.expectRevert(Heirloom.NotYetExpired.selector);
        v.executeRelease();
        assertEq(heir.balance, 0);
        assertFalse(v.released());
    }

    /// An owner check-in at any time before execution always prevents release.
    function testFuzz_ownerCheckInAlwaysCancels(uint256 waitAfterVotes, uint256 extra) public {
        _toGraceEnd();
        _vote2();
        waitAfterVotes = bound(waitAfterVotes, 0, 400 days);
        vm.warp(block.timestamp + waitAfterVotes);
        vm.prank(owner);
        v.checkIn();
        extra = bound(extra, 0, uint256(INTERVAL) + GRACE);
        vm.warp(block.timestamp + extra);
        vm.expectRevert(Heirloom.NotYetExpired.selector);
        v.executeRelease();
        assertEq(address(v).balance, 10 ether);
    }

    /// Only the beneficiary ever receives: whatever guardian subset / timing, funds go to heir.
    function testFuzz_onlyBeneficiaryReceives(uint8 thr, uint256 extraWait) public {
        thr = uint8(bound(thr, 1, 3));
        Heirloom.Params memory p = params();
        p.threshold = thr;
        Heirloom x = new Heirloom(owner, p);
        vm.deal(address(x), 3 ether);
        vm.warp(x.graceEnd() + 1);
        address[3] memory gs = [g1, g2, g3];
        for (uint256 i; i < thr; i++) {
            vm.prank(gs[i]);
            x.approveRelease();
        }
        extraWait = bound(extraWait, CHALLENGE, 3 * 365 days);
        vm.warp(block.timestamp + extraWait);
        vm.prank(rando);
        x.executeRelease();
        assertEq(heir.balance, 3 ether);
        assertEq(g1.balance + g2.balance + g3.balance + rando.balance, 0);
    }

    function testFuzz_timingsBounds(uint64 i, uint64 g, uint64 c, uint64 f) public {
        vm.startPrank(owner);
        bool okI = i >= 1 days && i <= 5 * 365 days;
        bool okG = g >= 1 days && g <= 365 days;
        bool okC = c >= 1 days && c <= 90 days;
        bool okF = f == 0 || (f >= 7 days && f <= 5 * 365 days);
        if (okI && okG && okC && okF) {
            v.setTimings(i, g, c, f);
            assertEq(v.interval(), i);
        } else {
            vm.expectRevert(Heirloom.BadParams.selector);
            v.setTimings(i, g, c, f);
        }
        vm.stopPrank();
    }

    function testFuzz_deposits_neverLostOnClose(uint96 amt) public {
        vm.deal(rando, amt);
        vm.prank(rando);
        (bool ok,) = address(v).call{value: amt}("");
        assertTrue(ok);
        uint256 before = owner.balance;
        vm.prank(owner);
        v.closeVault();
        assertEq(owner.balance, before + 10 ether + amt);
    }
}

contract HeirloomFactoryTest is HeirloomBase {
    function test_factoryDeploysIsolatedVaults() public {
        HeirloomFactory f = new HeirloomFactory();
        vm.prank(owner);
        address a = f.create(params());
        vm.prank(rando);
        address b = f.create(params());
        assertTrue(a != b);
        assertEq(Heirloom(payable(a)).owner(), owner);
        assertEq(Heirloom(payable(b)).owner(), rando);
        assertEq(f.vaultsOf(owner).length, 1);
        assertEq(f.totalVaults(), 2);
        // owner of vault A cannot touch vault B
        vm.prank(owner);
        vm.expectRevert(Heirloom.NotOwner.selector);
        Heirloom(payable(b)).checkIn();
    }
}
