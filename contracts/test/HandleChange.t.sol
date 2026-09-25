// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";

/// @notice Changing a username.
///
/// v1 let an account register once and never again, which is not how a name
/// works. The property that has to survive renaming is uniqueness: the old
/// name must become free at the same moment the new one is taken, or a rename
/// either strands a name nobody can use or lets one account hold two.
contract HandleChangeTest is Test {
    IdentityRegistry id;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    bytes32 constant FIRST = bytes32("alice");
    bytes32 constant SECOND = bytes32("alice2");

    function setUp() public {
        id = new IdentityRegistry();
        vm.prank(alice);
        id.register(FIRST, "");
    }

    function test_changeMovesTheHandle() public {
        vm.prank(alice);
        id.changeHandle(SECOND);

        assertEq(id.handleOf(alice), SECOND);
        assertEq(id.handleOwner(SECOND), alice);
    }

    /// The old name has to become claimable, or every rename burns one.
    function test_theOldHandleIsFreed() public {
        vm.prank(alice);
        id.changeHandle(SECOND);

        assertEq(id.handleOwner(FIRST), address(0));

        vm.prank(bob);
        id.register(FIRST, "");
        assertEq(id.handleOwner(FIRST), bob);
    }

    function test_cannotTakeANameSomeoneElseHolds() public {
        vm.prank(bob);
        id.register(SECOND, "");

        vm.prank(alice);
        vm.expectRevert(IdentityRegistry.HandleTaken.selector);
        id.changeHandle(SECOND);
    }

    function test_cannotChangeBeforeRegistering() public {
        vm.prank(bob);
        vm.expectRevert(IdentityRegistry.NotRegistered.selector);
        id.changeHandle(SECOND);
    }

    function test_cannotChangeToNothing() public {
        vm.prank(alice);
        vm.expectRevert(IdentityRegistry.EmptyHandle.selector);
        id.changeHandle(bytes32(0));
    }

    /// Renaming to the name you already hold would otherwise free it and
    /// re-take it, which is a no-op with a hole in the middle.
    function test_changingToTheSameNameIsRejected() public {
        vm.prank(alice);
        vm.expectRevert(IdentityRegistry.HandleTaken.selector);
        id.changeHandle(FIRST);
    }

    function test_registerStillRefusesASecondClaim() public {
        vm.prank(alice);
        vm.expectRevert(IdentityRegistry.AlreadyRegistered.selector);
        id.register(SECOND, "");
    }
}
