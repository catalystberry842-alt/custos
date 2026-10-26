// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Heirloom} from "../../src/Heirloom.sol";

contract MockERC20 {
    string public name = "Mock";
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 a) external {
        balanceOf[to] += a;
    }

    function approve(address s, uint256 a) external returns (bool) {
        allowance[msg.sender][s] = a;
        return true;
    }

    function transfer(address to, uint256 a) external virtual returns (bool) {
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }

    function transferFrom(address f, address t, uint256 a) external virtual returns (bool) {
        allowance[f][msg.sender] -= a;
        balanceOf[f] -= a;
        balanceOf[t] += a;
        return true;
    }
}

/// USDT-style: no return value.
contract NoReturnToken {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 a) external {
        balanceOf[to] += a;
    }

    function transfer(address to, uint256 a) external {
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
    }

    function transferFrom(address, address, uint256) external pure {}
}

/// transfer always reverts (blacklisted / paused token).
contract RevertingToken is MockERC20 {
    function transfer(address, uint256) external pure override returns (bool) {
        revert("blocked");
    }
}

/// transfer burns all gas.
contract GasBombToken is MockERC20 {
    uint256 public junk;

    function transfer(address, uint256) external override returns (bool) {
        while (true) {
            junk++;
        }
        return true;
    }
}

/// transfer returns a huge blob (return-data bomb).
contract ReturnBombToken is MockERC20 {
    function transfer(address, uint256) external pure override returns (bool) {
        assembly {
            revert(0, 500000)
        }
    }
}

/// transfer returns false.
contract FalseToken is MockERC20 {
    function transfer(address, uint256) external pure override returns (bool) {
        return false;
    }
}

/// Token whose transfer calls back into the vault.
contract ReentrantToken is MockERC20 {
    Heirloom public vault;
    uint256 public attempts;
    uint256 public succeeded;

    function setVault(Heirloom v) external {
        vault = v;
    }

    function transfer(address to, uint256 a) external override returns (bool) {
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        attempts++;
        try vault.executeRelease() {
            succeeded++;
        } catch {}
        try vault.sweep() {
            succeeded++;
        } catch {}
        try vault.beneficiaryClaim() {
            succeeded++;
        } catch {}
        return true;
    }
}

/// Beneficiary that tries to re-enter on every MON it receives.
contract ReentrantBeneficiary {
    Heirloom public vault;
    uint256 public attempts;
    uint256 public succeeded;
    uint256 public received;

    function setVault(Heirloom v) external {
        vault = v;
    }

    receive() external payable {
        attempts++;
        received += msg.value;
        try vault.executeRelease() {
            succeeded++;
        } catch {}
        try vault.sweep() {
            succeeded++;
        } catch {}
        try vault.beneficiaryClaim() {
            succeeded++;
        } catch {}
        try vault.sweepToken(address(0)) {
            succeeded++;
        } catch {}
    }
}

/// Beneficiary that rejects MON until told otherwise.
contract PickyBeneficiary {
    bool public accept;

    function setAccept(bool a) external {
        accept = a;
    }

    receive() external payable {
        require(accept, "no");
    }

    function redirect(Heirloom v, address to) external {
        v.redirectPayout(to);
    }
}

/// Beneficiary that burns all gas on receive.
contract GasBombBeneficiary {
    uint256 public junk;

    receive() external payable {
        while (true) {
            junk++;
        }
    }
}

/// Owner that is a contract and tries to re-enter withdraw paths.
contract ReentrantOwner {
    Heirloom public vault;
    uint256 public reenterSucceeded;
    bool public armed;

    function setVault(Heirloom v) external {
        vault = v;
    }

    function arm() external {
        armed = true;
    }

    function withdraw(uint256 a) external {
        vault.withdrawNative(a);
    }

    receive() external payable {
        if (armed) {
            armed = false;
            try vault.withdrawNative(1) {
                reenterSucceeded++;
            } catch {}
            try vault.closeVault() {
                reenterSucceeded++;
            } catch {}
        }
    }
}
