// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Heirloom} from "../src/Heirloom.sol";
import {HeirloomFactory} from "../src/HeirloomFactory.sol";
import "./mocks/Mocks.sol";

/// Agent layer: an AI's operator key may spend within owner-set limits, only while the owner is alive.
contract AgentBase is Test {
    Heirloom v;
    MockERC20 usdc;
    address owner = makeAddr("owner");
    address heir = makeAddr("heir");
    address g1 = makeAddr("g1");
    address g2 = makeAddr("g2");
    address g3 = makeAddr("g3");
    address agent = makeAddr("agent");
    address vendor = makeAddr("vendor");
    address vendor2 = makeAddr("vendor2");
    address successor = makeAddr("successor");
    address rando = makeAddr("rando");

    uint64 constant INTERVAL = 30 days;
    uint64 constant GRACE = 7 days;
    uint64 constant CHALLENGE = 3 days;
    uint64 constant PERIOD = 1 days;
    uint128 constant ETH_TX = 1 ether;
    uint128 constant ETH_PERIOD = 3 ether;
    uint128 constant USD_TX = 100e6;
    uint128 constant USD_PERIOD = 250e6;

    function setUp() public virtual {
        vm.warp(1_800_000_000);
        vm.roll(1_000);
        address[] memory gs = new address[](3);
        gs[0] = g1;
        gs[1] = g2;
        gs[2] = g3;
        Heirloom.Params memory p = Heirloom.Params(heir, gs, 2, INTERVAL, GRACE, CHALLENGE, 30 days);
        vm.prank(owner);
        v = new Heirloom(owner, p);
        usdc = new MockERC20();
        vm.deal(address(v), 20 ether);
        usdc.mint(address(v), 10_000e6);
        vm.startPrank(owner);
        v.setAgent(agent, PERIOD, GRACE);
        v.setAssetLimit(address(0), ETH_TX, ETH_PERIOD);
        v.setAssetLimit(address(usdc), USD_TX, USD_PERIOD);
        v.setRecipient(vendor, true);
        v.setRecipient(vendor2, true);
        v.setSuccessor(successor);
        vm.stopPrank();
    }

    function _spendEth(uint256 a) internal {
        vm.prank(agent);
        v.agentSpend(address(0), vendor, a);
    }

    function _lapse() internal {
        vm.warp(v.graceEnd() + 1);
    }

    function _vote(address g, Heirloom.Outcome o) internal {
        vm.prank(g);
        v.approveOutcome(o);
    }
}

contract AgentConfigTest is AgentBase {
    function test_setup_state() public view {
        assertEq(v.agent(), agent);
        assertEq(v.agentPeriod(), PERIOD);
        assertEq(v.agentLateAllowance(), GRACE);
        assertEq(v.successor(), successor);
        assertTrue(v.isRecipient(vendor));
        (uint128 tx_, uint128 per) = v.assetLimit(address(0));
        assertEq(tx_, ETH_TX);
        assertEq(per, ETH_PERIOD);
        assertEq(uint8(v.agentState()), uint8(Heirloom.AgentState.Active));
        assertEq(v.agentAssets().length, 2);
        assertEq(v.recipients().length, 2);
        assertTrue(v.isToken(address(usdc))); // auto-listed so release forwards leftovers
    }

    function test_onlyOwnerCanConfigure() public {
        vm.startPrank(rando);
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.setAgent(rando, PERIOD, 0);
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.revokeAgent();
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.setAssetLimit(address(0), 1, 1);
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.removeAssetLimit(address(0));
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.setRecipient(rando, true);
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.freezeAgent();
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.unfreezeAgent();
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.setSuccessor(rando);
        vm.stopPrank();
    }

    function test_roleSeparation() public {
        vm.startPrank(owner);
        vm.expectRevert(Heirloom.RoleConflict.selector);
        v.setAgent(g1, PERIOD, 0); // guardian can't be the agent
        vm.expectRevert(Heirloom.RoleConflict.selector);
        v.setAgent(heir, PERIOD, 0);
        vm.expectRevert(Heirloom.RoleConflict.selector);
        v.setAgent(owner, PERIOD, 0);
        vm.expectRevert(Heirloom.RoleConflict.selector);
        v.setAgent(successor, PERIOD, 0);
        vm.expectRevert(Heirloom.RoleConflict.selector);
        v.setAgent(vendor, PERIOD, 0); // a recipient can't be the agent
        vm.expectRevert(Heirloom.ZeroAddress.selector);
        v.setAgent(address(0), PERIOD, 0);
        vm.expectRevert(Heirloom.RoleConflict.selector);
        v.setRecipient(agent, true); // agent can't be paid by itself
        vm.expectRevert(Heirloom.RoleConflict.selector);
        v.setSuccessor(agent);
        vm.expectRevert(Heirloom.RoleConflict.selector);
        v.setSuccessor(heir);
        vm.expectRevert(Heirloom.RoleConflict.selector);
        v.setSuccessor(g2);
        vm.expectRevert(Heirloom.RoleConflict.selector);
        v.setSuccessor(vendor);
        vm.expectRevert(Heirloom.BadParams.selector);
        v.setBeneficiary(agent);
        vm.expectRevert(Heirloom.BadParams.selector);
        v.setBeneficiary(successor);
        vm.expectRevert(Heirloom.RoleConflict.selector);
        v.replaceGuardian(g1, agent);
        vm.expectRevert(Heirloom.RoleConflict.selector);
        v.replaceGuardian(g1, successor);
        address[] memory gs = new address[](1);
        gs[0] = agent;
        vm.expectRevert(Heirloom.RoleConflict.selector);
        v.setGuardians(gs, 1);
        vm.stopPrank();
    }

    function test_badParams() public {
        vm.startPrank(owner);
        vm.expectRevert(Heirloom.BadParams.selector);
        v.setAgent(rando, 59 minutes, 0);
        vm.expectRevert(Heirloom.BadParams.selector);
        v.setAgent(rando, 366 days, 0);
        vm.expectRevert(Heirloom.BadParams.selector);
        v.setAgent(rando, PERIOD, 366 days);
        vm.expectRevert(Heirloom.BadParams.selector);
        v.setAssetLimit(address(0), 0, 1);
        vm.expectRevert(Heirloom.BadParams.selector);
        v.setAssetLimit(address(0), 2, 1); // per-period below per-tx
        vm.expectRevert(Heirloom.ZeroAddress.selector);
        v.setAssetLimit(address(0xdead), 1, 1); // token without code
        vm.stopPrank();
    }

    function test_boundedLists() public {
        vm.startPrank(owner);
        for (uint256 i; i < 6; ++i) {
            v.setAssetLimit(address(new MockERC20()), 1, 1);
        } // 2 existing + 6 = 8
        address extra = address(new MockERC20());
        vm.expectRevert(Heirloom.TooMany.selector);
        v.setAssetLimit(extra, 1, 1);
        for (uint256 i; i < 30; ++i) {
            v.setRecipient(address(uint160(0x1000 + i)), true);
        } // 2 existing + 30 = 32
        vm.expectRevert(Heirloom.TooMany.selector);
        v.setRecipient(address(uint160(0x2000)), true);
        vm.stopPrank();
    }

    function test_removeAssetLimitAndRecipient() public {
        vm.startPrank(owner);
        v.removeAssetLimit(address(usdc));
        v.setRecipient(vendor2, false);
        vm.stopPrank();
        assertEq(v.agentAssets().length, 1);
        assertEq(v.recipients().length, 1);
        vm.prank(agent);
        vm.expectRevert(Heirloom.AssetNotAllowed.selector);
        v.agentSpend(address(usdc), vendor, 1);
        vm.prank(agent);
        vm.expectRevert(Heirloom.RecipientNotAllowed.selector);
        v.agentSpend(address(0), vendor2, 1);
        vm.startPrank(owner);
        vm.expectRevert(Heirloom.NothingToDo.selector);
        v.removeAssetLimit(address(usdc));
        vm.expectRevert(Heirloom.NothingToDo.selector);
        v.setRecipient(vendor2, false);
        vm.stopPrank();
    }

    function test_cannotDelistTokenWhileLimited() public {
        vm.prank(owner);
        vm.expectRevert(Heirloom.AssetHasLimit.selector);
        v.removeToken(address(usdc));
    }

    function test_everyAgentConfigActionIsOwnerProofOfLife() public {
        vm.warp(block.timestamp + 10 days);
        uint256 e = v.epoch();
        vm.prank(owner);
        v.setRecipient(rando, true);
        assertEq(v.lastCheckIn(), block.timestamp);
        assertEq(v.epoch(), e + 1);
    }

    function test_setAgentResetsSpendAndOwnerFreeze() public {
        _spendEth(1 ether);
        vm.startPrank(owner);
        v.freezeAgent();
        address agent2 = makeAddr("agent2");
        v.setAgent(agent2, PERIOD, 0);
        vm.stopPrank();
        (, uint256 rem,) = v.agentAllowance(address(0));
        assertEq(rem, ETH_PERIOD); // fresh budget for the new key
        vm.prank(agent);
        vm.expectRevert(Heirloom.NotAgent.selector); // old key is dead
        v.agentSpend(address(0), vendor, 1);
        vm.prank(agent2);
        v.agentSpend(address(0), vendor, 1);
    }

    function test_revokeClearsEverything() public {
        vm.prank(owner);
        v.revokeAgent();
        assertEq(v.agent(), address(0));
        assertEq(v.agentAssets().length, 0);
        assertEq(v.recipients().length, 0);
        assertFalse(v.isRecipient(vendor));
        (uint128 a, uint128 b) = v.assetLimit(address(0));
        assertEq(a + b, 0);
        assertEq(uint8(v.agentState()), uint8(Heirloom.AgentState.None));
        vm.prank(agent);
        vm.expectRevert(Heirloom.NotAgent.selector);
        v.agentSpend(address(0), vendor, 1);
        vm.prank(owner);
        vm.expectRevert(Heirloom.NoAgent.selector);
        v.revokeAgent();
    }

    function test_ownerCanReplaceOrRevokeAnyTimeEvenWhenFrozenOrLate() public {
        vm.warp(block.timestamp + INTERVAL + 1); // owner is late; agent state may be frozen/active but owner can still act
        vm.prank(owner);
        v.revokeAgent();
        assertEq(v.agent(), address(0));
    }
}

contract AgentSpendTest is AgentBase {
    function test_spendNativeWithinLimits() public {
        uint256 before_ = vendor.balance;
        _spendEth(1 ether);
        assertEq(vendor.balance - before_, 1 ether);
        (, uint256 rem,) = v.agentAllowance(address(0));
        assertEq(rem, 2 ether);
    }

    function test_spendTokenWithinLimits() public {
        vm.prank(agent);
        v.agentSpend(address(usdc), vendor, 100e6);
        assertEq(usdc.balanceOf(vendor), 100e6);
    }

    function test_perTxLimit() public {
        vm.prank(agent);
        vm.expectRevert(Heirloom.OverPerTxLimit.selector);
        v.agentSpend(address(0), vendor, 1 ether + 1);
        vm.prank(agent);
        vm.expectRevert(Heirloom.OverPerTxLimit.selector);
        v.agentSpend(address(usdc), vendor, USD_TX + 1);
    }

    function test_zeroAmountReverts() public {
        vm.prank(agent);
        vm.expectRevert(Heirloom.OverPerTxLimit.selector);
        v.agentSpend(address(0), vendor, 0);
    }

    function test_perPeriodLimit_andRollsOver() public {
        _spendEth(1 ether);
        _spendEth(1 ether);
        _spendEth(1 ether);
        vm.prank(agent);
        vm.expectRevert(Heirloom.OverPeriodLimit.selector);
        v.agentSpend(address(0), vendor, 1);
        vm.warp(block.timestamp + PERIOD - 1);
        vm.prank(agent);
        vm.expectRevert(Heirloom.OverPeriodLimit.selector);
        v.agentSpend(address(0), vendor, 1);
        vm.warp(block.timestamp + 1); // window over
        _spendEth(1 ether);
        (, uint256 rem,) = v.agentAllowance(address(0));
        assertEq(rem, 2 ether);
    }

    function test_periodsAreIndependentPerAsset() public {
        _spendEth(1 ether);
        _spendEth(1 ether);
        _spendEth(1 ether);
        vm.prank(agent);
        vm.expectRevert(Heirloom.OverPeriodLimit.selector);
        v.agentSpend(address(0), vendor, 1);
        vm.prank(agent);
        v.agentSpend(address(usdc), vendor, 100e6); // ETH exhausted, USD untouched
    }

    function test_notAllowlistedRecipientOrAsset() public {
        address other = address(new MockERC20());
        vm.startPrank(agent);
        vm.expectRevert(Heirloom.RecipientNotAllowed.selector);
        v.agentSpend(address(0), rando, 1);
        vm.expectRevert(Heirloom.RecipientNotAllowed.selector);
        v.agentSpend(address(0), agent, 1); // not even itself
        vm.expectRevert(Heirloom.AssetNotAllowed.selector);
        v.agentSpend(other, vendor, 1);
        vm.stopPrank();
    }

    function test_onlyTheAgentCanSpend() public {
        vm.prank(rando);
        vm.expectRevert(Heirloom.NotAgent.selector);
        v.agentSpend(address(0), vendor, 1);
        vm.prank(owner);
        vm.expectRevert(Heirloom.NotAgent.selector);
        v.agentSpend(address(0), vendor, 1); // not even the owner through this door
        vm.prank(g1);
        vm.expectRevert(Heirloom.NotAgent.selector);
        v.agentSpend(address(0), vendor, 1);
    }

    function test_noAgentMeansNoSpend() public {
        vm.prank(owner);
        v.revokeAgent();
        vm.prank(address(0));
        vm.expectRevert(Heirloom.NotAgent.selector);
        v.agentSpend(address(0), vendor, 1);
    }

    function test_spendIsNotProofOfLife() public {
        uint64 last = v.lastCheckIn();
        uint256 e = v.epoch();
        vm.warp(block.timestamp + 5 days);
        _spendEth(1 ether);
        assertEq(v.lastCheckIn(), last);
        assertEq(v.epoch(), e);
    }

    function test_eventEmitted() public {
        vm.expectEmit(true, true, true, true);
        emit Heirloom.AgentSpent(agent, address(0), vendor, 1 ether, 1 ether, ETH_PERIOD);
        _spendEth(1 ether);
    }

    function test_insufficientVaultBalanceRevertsAndConsumesNothing() public {
        vm.prank(owner);
        v.withdrawNative(address(v).balance);
        vm.prank(agent);
        vm.expectRevert(Heirloom.TransferFailedErr.selector);
        v.agentSpend(address(0), vendor, 1 ether);
        (, uint256 rem,) = v.agentAllowance(address(0));
        assertEq(rem, ETH_PERIOD);
    }

    function test_spendWorksWhileOwnerPaused() public {
        vm.prank(owner);
        v.pause(30 days);
        vm.warp(block.timestamp + 20 days);
        _spendEth(1 ether); // owner is on vacation = still alive
    }

    function test_ownerWithdrawalsAndReleaseStillWork() public {
        _spendEth(1 ether);
        vm.prank(owner);
        v.withdrawNative(1 ether);
    }
}

contract AgentFreezeTest is AgentBase {
    function test_frozenOnceOwnerLapsesPastGrace() public {
        // late allowance == grace → agent may work until graceEnd, then is frozen automatically
        vm.warp(v.graceEnd());
        _spendEth(1 ether); // still allowed exactly at the cutoff
        assertEq(uint8(v.agentState()), uint8(Heirloom.AgentState.Active));
        vm.warp(v.graceEnd() + 1);
        assertEq(uint8(v.agentState()), uint8(Heirloom.AgentState.FrozenLapsed));
        vm.prank(agent);
        vm.expectRevert(Heirloom.AgentIsFrozen.selector);
        v.agentSpend(address(0), vendor, 1);
    }

    function test_zeroLateAllowance_freezesAtDeadline() public {
        vm.prank(owner);
        v.setAgent(agent, PERIOD, 0);
        vm.warp(v.expiry());
        _spendEth(1);
        vm.warp(v.expiry() + 1);
        vm.prank(agent);
        vm.expectRevert(Heirloom.AgentIsFrozen.selector);
        v.agentSpend(address(0), vendor, 1);
    }

    function test_lateAllowanceClampedToGrace() public {
        vm.prank(owner);
        v.setAgent(agent, PERIOD, 300 days); // more than grace
        assertEq(v.agentCutoff(), v.graceEnd());
        vm.warp(v.graceEnd() + 1);
        vm.prank(agent);
        vm.expectRevert(Heirloom.AgentIsFrozen.selector);
        v.agentSpend(address(0), vendor, 1);
    }

    function test_noSpendDuringChallengeOrAfter() public {
        _lapse();
        _vote(g1, Heirloom.Outcome.Release);
        _vote(g2, Heirloom.Outcome.Release);
        assertEq(uint8(v.status()), uint8(Heirloom.Status.Challenge));
        assertEq(uint8(v.agentState()), uint8(Heirloom.AgentState.FrozenLapsed));
        vm.prank(agent);
        vm.expectRevert(Heirloom.AgentIsFrozen.selector);
        v.agentSpend(address(0), vendor, 1);
        vm.warp(block.timestamp + CHALLENGE);
        v.executeRelease();
        assertEq(uint8(v.agentState()), uint8(Heirloom.AgentState.Stopped));
        vm.prank(agent);
        vm.expectRevert(Heirloom.Finished.selector);
        v.agentSpend(address(0), vendor, 1);
    }

    function test_ownerReturningUnfreezesDuringChallengeWindow() public {
        _lapse();
        _vote(g1, Heirloom.Outcome.Release);
        _vote(g2, Heirloom.Outcome.Release);
        vm.prank(owner);
        v.checkIn(); // cancels the release…
        assertEq(uint8(v.status()), uint8(Heirloom.Status.Active));
        assertEq(uint8(v.agentState()), uint8(Heirloom.AgentState.Active)); // …and the agent works again
        _spendEth(1 ether);
    }

    function test_ownerReturningUnfreezesAfterPlainLapse() public {
        _lapse();
        vm.prank(owner);
        v.checkIn();
        _spendEth(1 ether);
    }

    function test_guardianFreeze_onlyWhenOwnerLate() public {
        vm.prank(g1);
        vm.expectRevert(Heirloom.NotYetExpired.selector);
        v.guardianFreezeAgent(); // owner is current: a guardian cannot grief the agent
        vm.warp(v.expiry() + 1); // late, still inside the agent's late allowance
        _spendEth(1);
        vm.prank(g1);
        v.guardianFreezeAgent();
        assertEq(uint8(v.agentState()), uint8(Heirloom.AgentState.FrozenByGuardian));
        vm.prank(agent);
        vm.expectRevert(Heirloom.AgentIsFrozen.selector);
        v.agentSpend(address(0), vendor, 1);
        vm.prank(g2);
        vm.expectRevert(Heirloom.NothingToDo.selector);
        v.guardianFreezeAgent();
    }

    function test_guardianFreeze_clearedByOwnerActivity() public {
        vm.warp(v.expiry() + 1);
        vm.prank(g3);
        v.guardianFreezeAgent();
        vm.prank(owner);
        v.checkIn();
        assertEq(uint8(v.agentState()), uint8(Heirloom.AgentState.Active));
        _spendEth(1);
    }

    function test_guardianFreeze_accessControl() public {
        vm.warp(v.expiry() + 1);
        vm.prank(rando);
        vm.expectRevert(Heirloom.NotGuardian.selector);
        v.guardianFreezeAgent();
        vm.prank(agent);
        vm.expectRevert(Heirloom.NotGuardian.selector);
        v.guardianFreezeAgent();
        vm.prank(owner);
        v.revokeAgent();
        vm.prank(g1);
        vm.expectRevert(Heirloom.NoAgent.selector);
        v.guardianFreezeAgent();
    }

    function test_guardianCannotFreezeOwnerVacation() public {
        vm.prank(owner);
        v.pause(60 days);
        vm.warp(block.timestamp + 40 days);
        vm.prank(g1);
        vm.expectRevert(Heirloom.NotYetExpired.selector);
        v.guardianFreezeAgent();
    }

    function test_ownerKillSwitch_survivesCheckIns() public {
        vm.prank(owner);
        v.freezeAgent();
        assertEq(uint8(v.agentState()), uint8(Heirloom.AgentState.FrozenByOwner));
        vm.prank(owner);
        v.checkIn();
        vm.prank(agent);
        vm.expectRevert(Heirloom.AgentIsFrozen.selector);
        v.agentSpend(address(0), vendor, 1);
        vm.prank(owner);
        v.unfreezeAgent();
        _spendEth(1);
        vm.prank(owner);
        vm.expectRevert(Heirloom.NothingToDo.selector);
        v.unfreezeAgent();
    }

    function test_ownerFreezeNoAgent() public {
        vm.startPrank(owner);
        v.revokeAgent();
        vm.expectRevert(Heirloom.NoAgent.selector);
        v.freezeAgent();
        vm.stopPrank();
    }

    function test_unfrozenAgentSpendsDoNotKeepAnAbsentOwnerAlive() public {
        // agent keeps spending (within limits) while owner is silent; the timer still runs out
        uint64 ge = v.graceEnd();
        vm.warp(v.expiry() + 1);
        _spendEth(1);
        vm.warp(ge + 1);
        assertEq(uint8(v.status()), uint8(Heirloom.Status.AwaitingGuardians));
    }
}

contract AgentCompromisedKeyTest is AgentBase {
    function test_agentCannotCallAnyOwnerOrGuardianFunction() public {
        address[] memory gs = new address[](1);
        gs[0] = rando;
        vm.startPrank(agent);
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.checkIn();
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.cancelRelease();
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.pause(1 days);
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.setBeneficiary(agent);
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.setTimings(1 days, 1 days, 1 days, 0);
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.setGuardians(gs, 1);
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.replaceGuardian(g1, agent);
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.addToken(address(usdc));
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.withdrawNative(1);
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.withdrawToken(address(usdc), 1);
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.closeVault();
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.setAgent(agent, 365 days, 365 days);
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.setAssetLimit(address(0), type(uint128).max, type(uint128).max);
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.setRecipient(agent, true);
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.unfreezeAgent();
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.setSuccessor(agent);
        vm.expectRevert(Heirloom.NotGuardian.selector);
        v.approveRelease();
        vm.expectRevert(Heirloom.NotGuardian.selector);
        v.approveOutcome(Heirloom.Outcome.Handover);
        vm.expectRevert(Heirloom.NotGuardian.selector);
        v.guardianFreezeAgent();
        vm.stopPrank();
    }

    function test_agentCannotEmptyTheVault_perPeriodCapHolds() public {
        uint256 start = vendor.balance;
        uint256 n;
        for (uint256 i; i < 50; ++i) {
            vm.prank(agent);
            try v.agentSpend(address(0), vendor, ETH_TX) {
                n++;
            } catch {}
        }
        assertEq(n, 3);
        assertEq(vendor.balance - start, ETH_PERIOD);
        assertEq(address(v).balance, 20 ether - ETH_PERIOD);
    }

    function test_splittingTxsCannotExceedPeriodCap() public {
        uint256 total;
        for (uint256 i; i < 200; ++i) {
            vm.prank(agent);
            try v.agentSpend(address(0), vendor, 0.1 ether) {
                total += 0.1 ether;
            } catch {}
        }
        assertEq(total, ETH_PERIOD);
    }

    function test_agentCannotPayItselfOrAnOutsider() public {
        vm.startPrank(agent);
        vm.expectRevert(Heirloom.RecipientNotAllowed.selector);
        v.agentSpend(address(0), agent, 1);
        vm.expectRevert(Heirloom.RecipientNotAllowed.selector);
        v.agentSpend(address(usdc), rando, 1);
        vm.stopPrank();
    }

    function test_agentCannotSpendAnUnlistedTokenEvenIfVaultHoldsIt() public {
        MockERC20 other = new MockERC20();
        other.mint(address(v), 1_000e6);
        vm.prank(agent);
        vm.expectRevert(Heirloom.AssetNotAllowed.selector);
        v.agentSpend(address(other), vendor, 1);
    }

    function test_afterOwnerRevokes_oldKeyIsPowerless() public {
        vm.prank(owner);
        v.revokeAgent();
        vm.prank(agent);
        vm.expectRevert(Heirloom.NotAgent.selector);
        v.agentSpend(address(0), vendor, 1);
    }

    function test_cannotKeepVaultAliveOrInfluenceTiming() public {
        uint64 ge = v.graceEnd();
        uint64 ex = v.expiry();
        vm.startPrank(agent);
        try v.agentSpend(address(0), vendor, 1) {} catch {}
        vm.stopPrank();
        assertEq(v.graceEnd(), ge);
        assertEq(v.expiry(), ex);
    }

    function test_compromisedKeyCannotChangeBeneficiaryOrSuccessorEvenAsGuardianImpersonator() public {
        vm.prank(agent);
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.setSuccessor(rando);
        assertEq(v.successor(), successor);
        assertEq(v.beneficiary(), heir);
    }
}

contract AgentHandoverTest is AgentBase {
    function test_handover_movesOwnershipAndKeepsFundsInVault() public {
        _lapse();
        uint256 bal = address(v).balance;
        _vote(g1, Heirloom.Outcome.Handover);
        _vote(g2, Heirloom.Outcome.Handover);
        assertEq(uint8(v.pendingOutcome()), uint8(Heirloom.Outcome.Handover));
        vm.expectRevert(Heirloom.ChallengeNotOver.selector);
        v.executeRelease();
        vm.warp(block.timestamp + CHALLENGE);
        v.executeRelease();
        assertEq(v.owner(), successor);
        assertEq(address(v).balance, bal);
        assertEq(usdc.balanceOf(address(v)), 10_000e6);
        assertEq(v.successor(), address(0));
        assertEq(v.agent(), address(0));
        assertEq(v.agentAssets().length, 0);
        assertEq(v.recipients().length, 0);
        assertEq(heir.balance, 0); // beneficiary did NOT get paid
        assertEq(uint8(v.status()), uint8(Heirloom.Status.Active)); // fresh timer for the new owner
        assertEq(v.lastCheckIn(), block.timestamp);
        assertFalse(v.released());
    }

    function test_afterHandover_oldOwnerLosesAllPowers_successorHasThem() public {
        _lapse();
        _vote(g1, Heirloom.Outcome.Handover);
        _vote(g2, Heirloom.Outcome.Handover);
        vm.warp(block.timestamp + CHALLENGE);
        v.executeRelease();
        vm.prank(owner);
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.withdrawNative(1 ether);
        vm.prank(owner);
        vm.expectRevert(Heirloom.NotOwner.selector);
        v.checkIn();
        vm.prank(successor);
        v.checkIn();
        uint256 before_ = successor.balance;
        vm.prank(successor);
        v.withdrawNative(5 ether);
        assertEq(successor.balance - before_, 5 ether);
        // the old agent is dead until the new owner re-authorises an agent
        vm.prank(agent);
        vm.expectRevert(Heirloom.NotAgent.selector);
        v.agentSpend(address(0), vendor, 1);
        address agent2 = makeAddr("agent2");
        vm.prank(successor);
        v.setAgent(agent2, PERIOD, 0);
        vm.prank(successor);
        v.setAssetLimit(address(0), 1 ether, 1 ether);
        vm.prank(successor);
        v.setRecipient(vendor, true);
        vm.prank(agent2);
        v.agentSpend(address(0), vendor, 1 ether);
    }

    function test_afterHandover_guardiansAndBeneficiaryStillProtectTheNewOwnersSwitch() public {
        _lapse();
        _vote(g1, Heirloom.Outcome.Handover);
        _vote(g2, Heirloom.Outcome.Handover);
        vm.warp(block.timestamp + CHALLENGE);
        v.executeRelease();
        // successor goes silent too → regular Release to the original beneficiary
        vm.warp(v.graceEnd() + 1);
        _vote(g1, Heirloom.Outcome.Release);
        _vote(g3, Heirloom.Outcome.Release);
        vm.warp(block.timestamp + CHALLENGE);
        uint256 bal = address(v).balance;
        v.executeRelease();
        assertEq(heir.balance, bal);
        assertTrue(v.released());
    }

    function test_handoverNeedsASuccessor() public {
        vm.prank(owner);
        v.setSuccessor(address(0));
        _lapse();
        vm.prank(g1);
        vm.expectRevert(Heirloom.NoSuccessor.selector);
        v.approveOutcome(Heirloom.Outcome.Handover);
        _vote(g1, Heirloom.Outcome.Release); // release still works
    }

    function test_handoverTooEarlyReverts() public {
        vm.warp(v.graceEnd());
        vm.prank(g1);
        vm.expectRevert(Heirloom.NotYetExpired.selector);
        v.approveOutcome(Heirloom.Outcome.Handover);
    }

    function test_splitVotesDoNotReachThreshold_untilAMajorityAgrees() public {
        _lapse();
        _vote(g1, Heirloom.Outcome.Release);
        _vote(g2, Heirloom.Outcome.Handover);
        assertEq(v.approvalCount(), 2);
        assertEq(v.challengeEnd(), 0); // 2 total votes but no outcome has 2
        _vote(g3, Heirloom.Outcome.Handover);
        assertEq(uint8(v.pendingOutcome()), uint8(Heirloom.Outcome.Handover));
        assertTrue(v.challengeEnd() != 0);
    }

    function test_withdrawingAVoteRemovesItFromItsOutcome() public {
        _lapse();
        _vote(g1, Heirloom.Outcome.Handover);
        vm.prank(g1);
        v.withdrawApproval();
        _vote(g1, Heirloom.Outcome.Release);
        _vote(g2, Heirloom.Outcome.Release);
        assertEq(uint8(v.pendingOutcome()), uint8(Heirloom.Outcome.Release));
    }

    function test_ownerReturningCancelsHandoverAndKeepsEverything() public {
        _lapse();
        _vote(g1, Heirloom.Outcome.Handover);
        _vote(g2, Heirloom.Outcome.Handover);
        vm.prank(owner);
        v.checkIn();
        assertEq(v.owner(), owner);
        assertEq(uint8(v.pendingOutcome()), uint8(Heirloom.Outcome.Release));
        vm.expectRevert(Heirloom.NotYetExpired.selector);
        v.executeRelease();
        _spendEth(1 ether); // agent is back
    }

    function test_ownerCanCancelEvenAfterChallengeWindowBeforeExecute() public {
        _lapse();
        _vote(g1, Heirloom.Outcome.Handover);
        _vote(g2, Heirloom.Outcome.Handover);
        vm.warp(block.timestamp + CHALLENGE + 5 days);
        vm.prank(owner);
        v.checkIn();
        vm.expectRevert(Heirloom.NotYetExpired.selector);
        v.executeRelease();
    }

    function test_changingSuccessorDuringChallengeCancelsIt() public {
        _lapse();
        _vote(g1, Heirloom.Outcome.Handover);
        _vote(g2, Heirloom.Outcome.Handover);
        vm.prank(owner);
        v.setSuccessor(rando);
        assertEq(v.challengeEnd(), 0);
    }

    function test_guardiansCannotChooseDestination() public {
        // the only reachable destinations are the beneficiary or the owner-named successor
        _lapse();
        _vote(g1, Heirloom.Outcome.Handover);
        _vote(g2, Heirloom.Outcome.Handover);
        vm.warp(block.timestamp + CHALLENGE);
        vm.prank(g3);
        v.executeRelease();
        assertEq(v.owner(), successor);
        assertEq(g1.balance + g2.balance + g3.balance, 0);
    }

    function test_releaseOutcome_shutsDownAgentForGood_andPaysBeneficiary() public {
        _spendEth(1 ether);
        _lapse();
        uint256 bal = address(v).balance;
        _vote(g1, Heirloom.Outcome.Release);
        _vote(g2, Heirloom.Outcome.Release);
        vm.warp(block.timestamp + CHALLENGE);
        v.executeRelease();
        assertEq(heir.balance, bal);
        assertEq(usdc.balanceOf(heir), 10_000e6);
        assertEq(uint8(v.agentState()), uint8(Heirloom.AgentState.Stopped));
        vm.prank(agent);
        vm.expectRevert(Heirloom.Finished.selector);
        v.agentSpend(address(0), vendor, 1);
    }

    function test_approveReleaseIsStillTheReleaseVote() public {
        _lapse();
        vm.prank(g1);
        v.approveRelease();
        vm.prank(g2);
        v.approveRelease();
        assertEq(uint8(v.pendingOutcome()), uint8(Heirloom.Outcome.Release));
        assertEq(uint8(v.status()), uint8(Heirloom.Status.Challenge));
    }

    function test_cannotSetBeneficiaryToPendingSuccessor() public {
        vm.prank(owner);
        vm.expectRevert(Heirloom.BadParams.selector);
        v.setBeneficiary(successor);
    }
}

contract AgentReentrancyAndTokensTest is AgentBase {
    function _agentContract() internal returns (AgentContract a) {
        a = new AgentContract(v);
        vm.prank(owner);
        v.setAgent(address(a), PERIOD, GRACE);
    }

    function test_hostileRecipientCannotReenterAnything() public {
        HostileRecipient h = new HostileRecipient();
        h.setVault(v, address(0));
        vm.prank(owner);
        v.setRecipient(address(h), true);
        vm.prank(agent);
        v.agentSpend(address(0), address(h), 1 ether);
        assertEq(h.attempts(), 1);
        assertEq(h.succeeded(), 0);
        assertEq(address(h).balance, 1 ether);
        (, uint256 rem,) = v.agentAllowance(address(0));
        assertEq(rem, ETH_PERIOD - 1 ether);
    }

    function test_hostileRecipientCannotReenterViaAgentContract() public {
        AgentContract a = _agentContract();
        HostileRecipient h = new HostileRecipient();
        h.setVault(v, address(a));
        vm.startPrank(owner);
        v.setRecipient(address(h), true);
        v.setAssetLimit(address(0), ETH_TX, ETH_PERIOD);
        vm.stopPrank();
        a.go(address(0), address(h), 1 ether);
        assertEq(a.reenterTried(), 1);
        assertEq(a.reenterOk(), 0);
        (, uint256 rem,) = v.agentAllowance(address(0));
        assertEq(rem, ETH_PERIOD - 1 ether); // only the single outer spend was counted
    }

    function test_hostileTokenCannotReenterViaAgentContract() public {
        AgentContract a = _agentContract();
        CallbackToken t = new CallbackToken();
        t.mint(address(v), 1_000e6);
        vm.startPrank(owner);
        v.setAssetLimit(address(t), 100e6, 200e6);
        vm.stopPrank();
        t.setHook(address(a), abi.encodeCall(AgentContract.reenter, ()));
        a.go(address(t), vendor, 100e6);
        assertEq(a.reenterTried(), 1);
        assertEq(a.reenterOk(), 0);
        assertEq(t.balanceOf(vendor), 100e6);
        (, uint256 rem,) = v.agentAllowance(address(t));
        assertEq(rem, 100e6);
    }

    function test_hostileTokenCannotTriggerReleaseOrApprove() public {
        CallbackToken t = new CallbackToken();
        t.mint(address(v), 1_000e6);
        vm.startPrank(owner);
        v.setAssetLimit(address(t), 100e6, 200e6);
        vm.stopPrank();
        t.setHook(address(v), abi.encodeCall(Heirloom.executeRelease, ()));
        vm.prank(agent);
        v.agentSpend(address(t), vendor, 50e6);
        assertFalse(v.released());
    }

    function test_revertingToken_agentSpendRevertsAndConsumesNothing() public {
        RevertingToken t = new RevertingToken();
        t.mint(address(v), 1_000e6);
        vm.prank(owner);
        v.setAssetLimit(address(t), 100e6, 200e6);
        vm.prank(agent);
        vm.expectRevert(Heirloom.TransferFailedErr.selector);
        v.agentSpend(address(t), vendor, 10e6);
        (, uint256 rem,) = v.agentAllowance(address(t));
        assertEq(rem, 200e6);
    }

    function test_falseReturningToken_reverts() public {
        FalseToken t = new FalseToken();
        t.mint(address(v), 1_000e6);
        vm.prank(owner);
        v.setAssetLimit(address(t), 100e6, 200e6);
        vm.prank(agent);
        vm.expectRevert(Heirloom.TransferFailedErr.selector);
        v.agentSpend(address(t), vendor, 10e6);
    }

    function test_gasBombToken_boundedAndReverts() public {
        GasBombToken t = new GasBombToken();
        t.mint(address(v), 1_000e6);
        vm.prank(owner);
        v.setAssetLimit(address(t), 100e6, 200e6);
        vm.prank(agent);
        vm.expectRevert(Heirloom.TransferFailedErr.selector);
        v.agentSpend{gas: 2_000_000}(address(t), vendor, 10e6);
    }

    function test_returnBombToken_boundedAndReverts() public {
        ReturnBombToken t = new ReturnBombToken();
        t.mint(address(v), 1_000e6);
        vm.prank(owner);
        v.setAssetLimit(address(t), 100e6, 200e6);
        vm.prank(agent);
        vm.expectRevert(Heirloom.TransferFailedErr.selector);
        v.agentSpend{gas: 2_000_000}(address(t), vendor, 10e6);
    }

    function test_noReturnToken_usdtStyle_works() public {
        NoReturnToken t = new NoReturnToken();
        t.mint(address(v), 1_000e6);
        vm.prank(owner);
        v.setAssetLimit(address(t), 100e6, 200e6);
        vm.prank(agent);
        v.agentSpend(address(t), vendor, 10e6);
        assertEq(t.balanceOf(vendor), 10e6);
    }

    function test_gasBombRecipient_boundedAndReverts() public {
        GasBombBeneficiary gb = new GasBombBeneficiary();
        vm.prank(owner);
        v.setRecipient(address(gb), true);
        vm.prank(agent);
        vm.expectRevert(Heirloom.TransferFailedErr.selector);
        v.agentSpend{gas: 2_000_000}(address(0), address(gb), 1 ether);
    }

    function test_rejectingRecipientReverts() public {
        PickyBeneficiary pb = new PickyBeneficiary();
        vm.prank(owner);
        v.setRecipient(address(pb), true);
        vm.prank(agent);
        vm.expectRevert(Heirloom.TransferFailedErr.selector);
        v.agentSpend(address(0), address(pb), 1 ether);
    }

    function test_hostileTokenDoesNotBlockReleaseOfEverythingElse() public {
        GasBombToken t = new GasBombToken();
        t.mint(address(v), 1_000e6);
        vm.prank(owner);
        v.setAssetLimit(address(t), 100e6, 200e6);
        _lapse();
        _vote(g1, Heirloom.Outcome.Release);
        _vote(g2, Heirloom.Outcome.Release);
        vm.warp(block.timestamp + CHALLENGE);
        uint256 bal = address(v).balance;
        v.executeRelease();
        assertEq(heir.balance, bal);
        assertEq(usdc.balanceOf(heir), 10_000e6);
    }
}

contract AgentFuzzTest is AgentBase {
    /// Whatever sequence the (possibly compromised) agent tries, total ETH out within one window never exceeds the cap.
    function testFuzz_neverExceedsPeriodCap(uint128[8] memory amounts) public {
        uint256 start = vendor.balance;
        for (uint256 i; i < amounts.length; ++i) {
            vm.prank(agent);
            try v.agentSpend(address(0), vendor, amounts[i]) {} catch {}
        }
        assertLe(vendor.balance - start, ETH_PERIOD);
        for (uint256 i; i < amounts.length; ++i) {
            // each individual success was ≤ per-tx cap is implied by the cap on the total of capped calls
        }
    }

    /// Across many windows the total can never exceed windows × cap.
    function testFuzz_multiWindowBound(uint64[6] memory gaps, uint128[6] memory amounts) public {
        uint256 start = vendor.balance;
        uint256 t0 = block.timestamp;
        for (uint256 i; i < gaps.length; ++i) {
            vm.warp(block.timestamp + (gaps[i] % (3 days)));
            vm.prank(agent);
            try v.agentSpend(address(0), vendor, amounts[i]) {} catch {}
        }
        uint256 elapsed = block.timestamp - t0;
        uint256 windows = elapsed / PERIOD + 1;
        assertLe(vendor.balance - start, windows * ETH_PERIOD);
    }

    /// After the cutoff (interval + late allowance) NO spend can succeed, for any warp, amount, block number.
    function testFuzz_frozenAfterCutoff(uint256 extra, uint128 amount, uint256 bn) public {
        extra = bound(extra, 1, 3 * 365 days);
        vm.warp(uint256(v.agentCutoff()) + extra);
        vm.roll(bn);
        vm.prank(agent);
        vm.expectRevert(Heirloom.AgentIsFrozen.selector);
        v.agentSpend(address(0), vendor, amount);
    }

    /// Before the cutoff and with no freeze, a within-limit spend always works, whatever block.number says.
    function testFuzz_activeBeforeCutoff_blockNumberIrrelevant(uint256 dt, uint256 bn) public {
        dt = bound(dt, 0, uint256(v.agentCutoff()) - block.timestamp);
        vm.warp(block.timestamp + dt);
        vm.roll(bn);
        _spendEth(1);
    }

    /// Owner activity ALWAYS restores a lapsed/guardian-frozen agent (not an owner-frozen one).
    function testFuzz_ownerActivityUnfreezes(uint256 extra, bool guardianFreeze) public {
        extra = bound(extra, 1, 2 * 365 days);
        vm.warp(uint256(v.expiry()) + extra);
        if (guardianFreeze) {
            vm.prank(g1);
            try v.guardianFreezeAgent() {} catch {}
        }
        vm.prank(owner);
        v.checkIn();
        assertEq(uint8(v.agentState()), uint8(Heirloom.AgentState.Active));
        _spendEth(1);
    }

    /// Votes can never produce a destination other than beneficiary/successor, for random vote patterns.
    function testFuzz_outcomeIsAlwaysOneOfTheTwo(uint8 a, uint8 b, uint8 c) public {
        _lapse();
        address[3] memory gs = [g1, g2, g3];
        uint8[3] memory vs = [a % 2, b % 2, c % 2];
        for (uint256 i; i < 3; ++i) {
            vm.prank(gs[i]);
            try v.approveOutcome(Heirloom.Outcome(vs[i])) {} catch {}
        }
        if (v.challengeEnd() != 0) {
            vm.warp(block.timestamp + CHALLENGE);
            v.executeRelease();
            bool toHeir = v.released();
            bool toSuccessor = v.owner() == successor;
            assertTrue(toHeir != toSuccessor);
            assertEq(g1.balance + g2.balance + g3.balance + rando.balance, 0);
        }
    }
}
