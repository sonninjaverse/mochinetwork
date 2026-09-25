// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";

contract IdentityRegistryTest is Test {
    IdentityRegistry registry;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        registry = new IdentityRegistry();
    }

    function test_RegisterClaimsHandle() public {
        vm.prank(alice);
        registry.register("alice", "ipfs://avatar");

        assertEq(registry.handleOwner("alice"), alice);
        assertEq(registry.handleOf(alice), bytes32("alice"));
    }

    function test_CannotClaimTakenHandle() public {
        vm.prank(alice);
        registry.register("alice", "");

        vm.prank(bob);
        vm.expectRevert(IdentityRegistry.HandleTaken.selector);
        registry.register("alice", "");
    }

    function test_CannotRegisterTwice() public {
        vm.startPrank(alice);
        registry.register("alice", "");
        vm.expectRevert(IdentityRegistry.AlreadyRegistered.selector);
        registry.register("alice2", "");
        vm.stopPrank();
    }

    function test_CannotRegisterEmptyHandle() public {
        vm.prank(alice);
        vm.expectRevert(IdentityRegistry.EmptyHandle.selector);
        registry.register(bytes32(0), "");
    }

    /// @dev A handle is read by people, not by ranking, so its alphabet is
    ///      enforced on chain the same way a community name is: uniqueness
    ///      without one spelling is not uniqueness.
    function test_RejectsMalformedHandles() public {
        bytes32[5] memory bad = [
            bytes32("ab"), // too short
            bytes32("Alice"), // uppercase
            bytes32("mo.nad"), // punctuation
            bytes32("ab_cd_efghijklmnop"), // 18, too long
            bytes32("way_too_long_here") // 17, too long
        ];
        for (uint256 i; i < bad.length; ++i) {
            assertFalse(registry.isValidHandle(bad[i]));
            vm.prank(alice);
            vm.expectRevert(IdentityRegistry.BadHandle.selector);
            registry.register(bad[i], "");
        }
    }

    function test_AcceptsHandlesAtTheBoundaries() public {
        assertTrue(registry.isValidHandle("abc")); // 3
        assertTrue(registry.isValidHandle("user_1"));
        assertTrue(registry.isValidHandle("abcdefghijklmno")); // 15
        assertFalse(registry.isValidHandle("abcdefghijklmnop")); // 16
        assertFalse(registry.isValidHandle(bytes32(0)));
    }

    function test_RejectsOversizedMetadata() public {
        vm.prank(alice);
        vm.expectRevert(IdentityRegistry.MetadataTooLong.selector);
        registry.register("alice", new string(8 * 1024 + 1));
    }

    /// @dev Metadata must never touch storage: ranking never reads it, so it
    ///      only ever lives in the event log.
    function test_MetadataIsEmittedNotStored() public {
        vm.recordLogs();
        vm.prank(alice);
        registry.register("alice", "ipfs://avatar");

        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 1);
        (string memory uri) = abi.decode(logs[0].data, (string));
        assertEq(uri, "ipfs://avatar");
    }

    function test_SetMetadataRequiresRegistration() public {
        vm.prank(alice);
        vm.expectRevert(IdentityRegistry.NotRegistered.selector);
        registry.setMetadata("ipfs://x");
    }
}
