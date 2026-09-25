// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {PostRegistry} from "../src/PostRegistry.sol";
import {CommunityRegistry} from "../src/CommunityRegistry.sol";

/// @notice Replies and attached media.
///
/// parentId is in storage because a ranking contract has to be able to tell a
/// reply from a post — an algorithm that cannot see the difference drops
/// replies into the feed as though they were top-level. mediaURI is not: no
/// ranking reads it, so it stays in event data with the text.
contract RepliesTest is Test {
    PostRegistry posts;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    event PostCreated(
        uint256 indexed id,
        address indexed author,
        uint48 createdAt,
        uint48 parentId,
        bytes32 community,
        string text,
        string mediaURI
    );

    function setUp() public {
        posts = new PostRegistry(new CommunityRegistry());
    }

    function test_postHasNoParent() public {
        vm.prank(alice);
        uint256 id = posts.post("hello", "");

        assertEq(posts.postOf(id).parentId, 0);
    }

    function test_replyRecordsItsParent() public {
        vm.prank(alice);
        uint256 parent = posts.post("hello", "");

        vm.prank(bob);
        uint256 child = posts.reply(uint48(parent), "hi back", "");

        assertEq(posts.postOf(child).parentId, uint48(parent));
        assertEq(posts.postOf(child).author, bob);
    }

    function test_replyCountsOnTheParent() public {
        vm.prank(alice);
        uint256 parent = posts.post("hello", "");

        vm.prank(bob);
        posts.reply(uint48(parent), "one", "");
        vm.prank(alice);
        posts.reply(uint48(parent), "two", "");

        assertEq(posts.postOf(parent).replyCount, 2);
    }

    function test_replyToAMissingPostReverts() public {
        vm.prank(bob);
        vm.expectRevert(PostRegistry.NoSuchPost.selector);
        posts.reply(999, "into the void", "");
    }

    /// A reply is a post, so it can be voted on and can be replied to. Storing
    /// the direct parent keeps that true without threading rules in storage.
    function test_replyToAReply() public {
        vm.prank(alice);
        uint256 root = posts.post("hello", "");
        vm.prank(bob);
        uint256 child = posts.reply(uint48(root), "hi", "");
        vm.prank(alice);
        uint256 grandchild = posts.reply(uint48(child), "hi again", "");

        assertEq(posts.postOf(grandchild).parentId, uint48(child));
        assertEq(posts.postOf(root).replyCount, 1);
        assertEq(posts.postOf(child).replyCount, 1);
    }

    function test_mediaIsEmittedAndNotStored() public {
        vm.expectEmit(true, true, false, true);
        emit PostCreated(1, alice, uint48(block.timestamp), 0, bytes32(0), "look", "ipfs://bafyabc");

        vm.prank(alice);
        posts.post("look", "ipfs://bafyabc");
    }

    /// An image with no words is a normal post; text-only stays normal too.
    function test_mediaAloneIsEnough() public {
        vm.prank(alice);
        uint256 id = posts.post("", "ipfs://bafyabc");

        assertEq(posts.postOf(id).author, alice);
    }

    function test_neitherTextNorMediaReverts() public {
        vm.prank(alice);
        vm.expectRevert(PostRegistry.EmptyText.selector);
        posts.post("", "");
    }
}
