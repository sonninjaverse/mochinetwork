// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {PostRegistry} from "../src/PostRegistry.sol";
import {CommunityRegistry} from "../src/CommunityRegistry.sol";
import {IPostRegistry, NetVotesFeed} from "../src/examples/NetVotesFeed.sol";

/// @notice The example in docs/writing-an-algorithm.md, tested.
///
/// A guide whose code has never run teaches its readers to write code that
/// does not run. These assert the four rules the guide states, against the
/// real PostRegistry rather than a mock.
contract NetVotesFeedTest is Test {
    PostRegistry posts;
    NetVotesFeed feed;

    address seed = address(0x5EED);
    address author = address(0xA07);
    address voter = address(0x1);
    address ring = address(0xBAD);

    function setUp() public {
        posts = new PostRegistry(new CommunityRegistry());
        feed = new NetVotesFeed(IPostRegistry(address(posts)));


        for (uint256 i; i < 3; ++i) {
            vm.prank(author);
            posts.post("a post", "");
        }
    }

    function _ids() private pure returns (uint256[] memory ids) {
        ids = new uint256[](3);
        ids[0] = 1;
        ids[1] = 2;
        ids[2] = 3;
    }

    function test_ranksTheMostLikedFirst() public {
        vm.prank(voter);
        posts.like(2);

        (uint256[] memory ordered, uint256[] memory scores) = feed.rank(seed, _ids());

        assertEq(ordered[0], 2);
        assertGt(scores[0], 0);
        assertEq(scores[1], 0);
    }

    function test_dislikesSubtract() public {
        vm.prank(voter);
        posts.like(1);
        vm.prank(seed);
        posts.like(2);
        vm.prank(voter);
        posts.dislike(2);

        (uint256[] memory ordered,) = feed.rank(seed, _ids());

        // Post 2 has one weighted like and one weighted dislike and nets out,
        // so the post with a single unopposed like wins.
        assertEq(ordered[0], 1);
    }

    /// The whole reason to score on weightedLikes rather than likeCount: a
    /// vote is worth the voter's weight, and a fresh account's is a whole one.
    function test_votesCarryTheVotersWeight() public {
        vm.prank(ring);
        posts.like(3);

        (, uint256[] memory scores) = feed.rank(seed, _ids());

        assertEq(posts.postOf(3).likeCount, 1);
        // A fresh account starts at one point, not a whole vote.
        assertEq(posts.postOf(3).weightedLikes, 1);
        assertGt(scores[0], 0);
    }

    /// Rule 2, the one that shows up to a reader as a blank page.
    function test_neverRevertsOnUnknownOrEmptyInput() public view {
        feed.rank(seed, new uint256[](0));

        uint256[] memory unknown = new uint256[](3);
        unknown[0] = 999_999;
        unknown[1] = 0;
        unknown[2] = type(uint256).max;
        (uint256[] memory ordered, uint256[] memory scores) = feed.rank(address(0), unknown);

        assertEq(ordered.length, 3);
        assertEq(scores.length, 3);
    }

    /// Rule 3: the arrays are read by index and must line up.
    function testFuzz_returnsMatchingArrays(uint8 n) public view {
        uint256[] memory ids = new uint256[](n);
        for (uint256 i; i < n; ++i) ids[i] = i + 1;

        (uint256[] memory ordered, uint256[] memory scores) = feed.rank(seed, ids);

        assertEq(ordered.length, ids.length);
        assertEq(scores.length, ids.length);
        for (uint256 i = 1; i < scores.length; ++i) {
            assertGe(scores[i - 1], scores[i]);
        }
    }
}
