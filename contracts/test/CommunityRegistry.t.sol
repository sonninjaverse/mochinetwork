// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {CommunityRegistry} from "../src/CommunityRegistry.sol";

contract CommunityRegistryTest is Test {
    CommunityRegistry registry;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        registry = new CommunityRegistry();
    }

    function test_CreateClaimsName() public {
        vm.prank(alice);
        registry.create("monad", "ipfs://about");
        assertEq(registry.creatorOf("monad"), alice);
    }

    function test_CannotCreateTakenName() public {
        vm.prank(alice);
        registry.create("monad", "");

        vm.prank(bob);
        vm.expectRevert(CommunityRegistry.NameTaken.selector);
        registry.create("monad", "");
    }

    /// @dev Tên bị bới ra từ text tự do, nên chỉ được tồn tại đúng một cách
    ///      viết có thể khớp. Hoa/thường và dấu chấm đều phải bật ra.
    function test_RejectsBadNames() public {
        bytes32[5] memory bad = [bytes32("ab"), "Monad", "mo.nad", "mo nad", "abcdefghijklmnopqrstuv"];
        for (uint256 i; i < bad.length; ++i) {
            vm.prank(alice);
            vm.expectRevert(CommunityRegistry.BadName.selector);
            registry.create(bad[i], "");
        }
    }

    function test_AcceptsNamesAtTheBoundaries() public {
        assertTrue(registry.isValidName("abc"));
        assertTrue(registry.isValidName("abcdefghijklmnopqrstu")); // 21
        assertTrue(registry.isValidName("a_1"));
        assertFalse(registry.isValidName(bytes32(0)));
    }

    /// @dev Một tên có byte 0 ở giữa sẽ decode ra khác nhau tùy client.
    function test_RejectsInteriorZeroByte() public {
        assertFalse(registry.isValidName(bytes32(abi.encodePacked("ab", bytes1(0), "cd"))));
    }

    function test_RejectsOversizedMetadata() public {
        vm.prank(alice);
        vm.expectRevert(CommunityRegistry.MetadataTooLong.selector);
        registry.create("monad", new string(8 * 1024 + 1));
    }

    function test_JoinAndLeave() public {
        vm.prank(alice);
        registry.create("monad", "");

        vm.prank(bob);
        registry.join("monad");
        assertGt(registry.joinedAt("monad", bob), 0);

        vm.prank(bob);
        registry.leave("monad");
        assertEq(registry.joinedAt("monad", bob), 0);
    }

    /// @dev Gọi hai lần không được hỏng: join khi đã join, leave khi đã leave.
    function test_JoinAndLeaveAreIdempotent() public {
        vm.prank(alice);
        registry.create("monad", "");

        vm.startPrank(bob);
        registry.join("monad");
        uint64 first = registry.joinedAt("monad", bob);
        registry.join("monad");
        assertEq(registry.joinedAt("monad", bob), first);
        registry.leave("monad");
        registry.leave("monad");
        assertEq(registry.joinedAt("monad", bob), 0);
        vm.stopPrank();
    }

    function test_CannotJoinMissingCommunity() public {
        vm.prank(bob);
        vm.expectRevert(CommunityRegistry.NoSuchCommunity.selector);
        registry.join("ghost");
    }

    function test_OnlyCreatorSetsMetadata() public {
        vm.prank(alice);
        registry.create("monad", "");

        vm.prank(bob);
        vm.expectRevert(CommunityRegistry.NotCreator.selector);
        registry.setMetadata("monad", "ipfs://hijack");

        vm.prank(alice);
        registry.setMetadata("monad", "ipfs://fine");
    }

    /// @dev Không có memberCount trong storage: đếm được từ event, và không
    ///      thuật toán on-chain nào đọc nó.
    function test_MetadataIsEmittedNotStored() public {
        vm.recordLogs();
        vm.prank(alice);
        registry.create("monad", "ipfs://about");

        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 1);
        (, string memory uri) = abi.decode(logs[0].data, (uint64, string));
        assertEq(uri, "ipfs://about");
    }
}
