// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {PostRegistry} from "../src/PostRegistry.sol";
import {CommunityRegistry} from "../src/CommunityRegistry.sol";

contract PostRegistryTest is Test {
    PostRegistry posts;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address carol = address(0xCA401);

    CommunityRegistry communities;

    function setUp() public {
        communities = new CommunityRegistry();
        posts = new PostRegistry(communities);
    }

    /// A community post may only be written by a member, and the refusal is
    /// the contract's rather than the client's.
    function test_PostingIntoACommunityRequiresMembership() public {
        bytes32 cats = bytes32("cats");
        vm.prank(alice);
        communities.create(cats, "");

        vm.prank(alice);
        vm.expectRevert(PostRegistry.NotAMember.selector);
        posts.postToCommunity(cats, "hello", "");

        vm.prank(alice);
        communities.join(cats);
        vm.prank(alice);
        uint256 id = posts.postToCommunity(cats, "hello", "");
        assertEq(posts.postOf(id).community, cats);
    }

    /// A comment inherits the room it is in, so replying does not need a join.
    function test_ReplyInheritsTheParentCommunity() public {
        bytes32 cats = bytes32("cats");
        vm.prank(alice);
        communities.create(cats, "");
        vm.prank(alice);
        communities.join(cats);

        vm.prank(alice);
        uint256 root = posts.postToCommunity(cats, "root", "");
        vm.prank(bob);
        uint256 child = posts.reply(uint48(root), "answer", "");

        assertEq(posts.postOf(child).community, cats);
    }

    function test_PostStoresMetadata() public {
        vm.prank(alice);
        uint256 id = posts.post("hello monad", "");

        PostRegistry.Post memory p = posts.postOf(id);
        assertEq(p.author, alice);
        assertEq(p.createdAt, uint48(block.timestamp));
        assertEq(p.likeCount, 0);
        assertEq(p.weightedLikes, 0);
    }

    function test_PostIdsIncrementFromOne() public {
        vm.startPrank(alice);
        assertEq(posts.post("a", ""), 1);
        assertEq(posts.post("b", ""), 2);
        vm.stopPrank();
    }

    /// @dev Text lives in the event log, so an unbounded payload would bloat
    ///      every indexer that reads it. The cap is generous enough for the
    ///      client's 280 characters in any UTF-8 encoding.
    function test_RejectsOversizedText() public {
        vm.prank(alice);
        vm.expectRevert(PostRegistry.TextTooLong.selector);
        posts.post(new string(1025), "");
    }

    function test_AcceptsTextAtTheLimit() public {
        vm.prank(alice);
        posts.post(new string(1024), "");
    }

    function test_RejectsOversizedMediaUri() public {
        vm.prank(alice);
        vm.expectRevert(PostRegistry.MediaUriTooLong.selector);
        posts.post("hi", new string(257));
    }

    /// @dev Zero is reserved as "no parent", so ids must start at 1.
    function test_ZeroIdIsEmptyPost() public view {
        PostRegistry.Post memory p = posts.postOf(0);
        assertEq(p.author, address(0));
    }

    /// @dev Text and media are the two things storage never sees: no ranking reads
    /// either, and a post costs the same whatever it says.
    function test_TextAndMediaAreEmittedNotStored() public {
        vm.recordLogs();
        vm.prank(alice);
        posts.post("hello monad", "ipfs://bafyabc");

        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 1);
        (,,, string memory text, string memory media) =
            abi.decode(logs[0].data, (uint48, uint48, bytes32, string, string));
        assertEq(text, "hello monad");
        assertEq(media, "ipfs://bafyabc");
    }

    function test_EmptyTextReverts() public {
        vm.prank(alice);
        vm.expectRevert(PostRegistry.EmptyText.selector);
        posts.post("", "");
    }

    /// @dev A top-level post has no parent and no replies until it gets one.
    function test_RepostAndReplyCountersStayZero() public {
        vm.prank(alice);
        uint256 id = posts.post("a", "");

        PostRegistry.Post memory p = posts.postOf(id);
        assertEq(p.repostCount, 0);
        assertEq(p.replyCount, 0);
        assertEq(p.parentId, 0);
    }

    /// A fresh account starts at one point — it may vote, but a stranger's
    /// vote is one per cent of one until the room has trusted it.
    function test_FreshAccountStartsAtOnePoint() public view {
        assertEq(posts.karmaOf(bob), 0);
        assertEq(posts.weightOf(bob), 1);
    }

    function test_LikeIncrementsCountersByTheVotersWeight() public {
        vm.prank(alice);
        uint256 id = posts.post("a", "");

        vm.prank(bob);
        posts.like(id);

        PostRegistry.Post memory p = posts.postOf(id);
        assertEq(p.likeCount, 1);
        assertEq(p.weightedLikes, posts.weightOf(bob));
        assertTrue(posts.hasLiked(id, bob));
    }

    /// Karma is the author's, and the vote that lands is the weight the voter
    /// carried when it landed.
    function test_LikeRaisesTheAuthorsKarma() public {
        vm.prank(alice);
        uint256 id = posts.post("a", "");

        vm.prank(bob);
        posts.like(id);

        assertEq(posts.karmaOf(alice), int256(uint256(posts.weightOf(bob))));
    }

    function test_UnlikeReversesCountersAndKarma() public {
        vm.prank(alice);
        uint256 id = posts.post("a", "");

        vm.startPrank(bob);
        posts.like(id);
        posts.unlike(id);
        vm.stopPrank();

        PostRegistry.Post memory p = posts.postOf(id);
        assertEq(p.likeCount, 0);
        assertEq(p.weightedLikes, 0);
        assertEq(posts.karmaOf(alice), 0);
        assertFalse(posts.hasLiked(id, bob));
    }

    /**
     * @dev Weight moves with karma, so a withdrawal subtracts the weight the
     *      vote carried, not the weight the voter has now. Two likers make the
     *      difference visible: after bob's 25 and carol's 25 the author holds
     *      50, and bob's withdrawal must take back exactly 25.
     */
    function test_WithdrawalSubtractsTheWeightItAdded() public {
        vm.prank(alice);
        uint256 id = posts.post("a", "");

        vm.prank(bob);
        posts.like(id);
        vm.prank(carol);
        posts.like(id);
        assertEq(posts.karmaOf(alice), 2);

        vm.prank(bob);
        posts.unlike(id);

        assertEq(posts.karmaOf(alice), 1);
        assertEq(posts.postOf(id).weightedLikes, 1);
    }

    /// The ladder: karma raises a voter's weight, so a good account's vote is
    /// worth more than a quiet one's.
    function test_WeightRisesWithKarma() public {
        vm.prank(alice);
        uint256 id = posts.post("a", "");
        assertEq(posts.weightOf(alice), 1);

        // Four fresh accounts, one point each: alice reaches 4 karma, which is
        // the first rung of the ladder.
        for (uint160 i = 1; i <= 4; i++) {
            address voter = address(1000 + i);
            vm.prank(voter);
            posts.like(id);
        }

        assertEq(posts.karmaOf(alice), 4);
        assertEq(posts.weightOf(alice), 5);
    }

    /// Karma below zero is silenced: the vote is worth nothing until the room
    /// upvotes the account back above zero.
    function test_HeavyDownvotesSilenceTheVote() public {
        vm.prank(alice);
        uint256 id = posts.post("a", "");

        for (uint160 i = 1; i <= 4; i++) {
            address voter = address(2000 + i);
            vm.prank(voter);
            posts.dislike(id);
        }

        assertEq(posts.karmaOf(alice), -4);
        assertEq(posts.weightOf(alice), 0);
    }

    /// You cannot vote on your own post, which is what stops karma being free.
    function test_CannotLikeOwnPost() public {
        vm.prank(alice);
        uint256 id = posts.post("a", "");

        vm.prank(alice);
        vm.expectRevert(PostRegistry.CannotVoteSelf.selector);
        posts.like(id);
    }

    function test_CannotDislikeOwnPost() public {
        vm.prank(alice);
        uint256 id = posts.post("a", "");

        vm.prank(alice);
        vm.expectRevert(PostRegistry.CannotVoteSelf.selector);
        posts.dislike(id);
    }

    function test_DoubleLikeIsNoop() public {
        vm.prank(alice);
        uint256 id = posts.post("a", "");

        vm.startPrank(bob);
        posts.like(id);
        posts.like(id);
        vm.stopPrank();

        assertEq(posts.postOf(id).likeCount, 1);
        assertEq(posts.karmaOf(alice), 1);
    }

    function test_DislikeIncrementsBothCounters() public {
        vm.prank(alice);
        uint256 id = posts.post("a", "");

        vm.prank(bob);
        posts.dislike(id);

        PostRegistry.Post memory p = posts.postOf(id);
        assertEq(p.dislikeCount, 1);
        assertEq(p.weightedDislikes, posts.weightOf(bob));
        assertTrue(posts.hasDisliked(id, bob));
    }

    function test_UndislikeReversesCountersAndKarma() public {
        vm.prank(alice);
        uint256 id = posts.post("a", "");

        vm.startPrank(bob);
        posts.dislike(id);
        posts.undislike(id);
        vm.stopPrank();

        PostRegistry.Post memory p = posts.postOf(id);
        assertEq(p.dislikeCount, 0);
        assertEq(p.weightedDislikes, 0);
        assertEq(posts.karmaOf(alice), 0);
        assertFalse(posts.hasDisliked(id, bob));
    }

    /// A vote is one direction at a time, as on Reddit.
    function test_LikingAfterDislikingWithdrawsTheDislike() public {
        vm.prank(alice);
        uint256 id = posts.post("a", "");

        vm.startPrank(bob);
        posts.dislike(id);
        posts.like(id);
        vm.stopPrank();

        PostRegistry.Post memory p = posts.postOf(id);
        assertEq(p.likeCount, 1);
        assertEq(p.dislikeCount, 0);
        assertEq(p.weightedLikes, 1);
        assertEq(p.weightedDislikes, 0);
        assertEq(posts.karmaOf(alice), 1);
        assertFalse(posts.hasDisliked(id, bob));
    }

    function test_DislikingAfterLikingWithdrawsTheLike() public {
        vm.prank(alice);
        uint256 id = posts.post("a", "");

        vm.startPrank(bob);
        posts.like(id);
        posts.dislike(id);
        vm.stopPrank();

        PostRegistry.Post memory p = posts.postOf(id);
        assertEq(p.likeCount, 0);
        assertEq(p.dislikeCount, 1);
        assertEq(posts.karmaOf(alice), -1);
    }

    function test_DoubleDislikeIsNoop() public {
        vm.prank(alice);
        uint256 id = posts.post("a", "");

        vm.startPrank(bob);
        posts.dislike(id);
        posts.dislike(id);
        vm.stopPrank();

        assertEq(posts.postOf(id).dislikeCount, 1);
    }

    function test_LikingNonexistentPostReverts() public {
        vm.prank(alice);
        vm.expectRevert(PostRegistry.NoSuchPost.selector);
        posts.like(999);
    }

    function test_DislikingNonexistentPostReverts() public {
        vm.prank(alice);
        vm.expectRevert(PostRegistry.NoSuchPost.selector);
        posts.dislike(999);
    }

    function test_PostsOfReturnsAllInOrder() public {
        vm.startPrank(alice);
        uint256 a = posts.post("a", "");
        uint256 b = posts.post("b", "");
        vm.stopPrank();

        uint256[] memory ids = new uint256[](2);
        ids[0] = b;
        ids[1] = a;

        PostRegistry.Post[] memory got = posts.postsOf(ids);
        assertEq(got.length, 2);
        assertEq(got[0].author, alice);
        assertEq(got[1].createdAt, posts.postOf(a).createdAt);
    }

    function test_PostsOfWithUnknownIdReturnsEmptyStruct() public view {
        uint256[] memory ids = new uint256[](1);
        ids[0] = 12345;
        PostRegistry.Post[] memory got = posts.postsOf(ids);
        assertEq(got[0].author, address(0));
    }
}
