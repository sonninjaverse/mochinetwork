// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {BestFeed} from "../../src/algorithms/BestFeed.sol";
import {ControversialFeed} from "../../src/algorithms/ControversialFeed.sol";
import {PostRegistry} from "../../src/PostRegistry.sol";
import {CommunityRegistry} from "../../src/CommunityRegistry.sol";
import {Weight} from "../lib/Weight.sol";

contract RedditSortsTest is Test {
    BestFeed best;
    ControversialFeed controversial;
    PostRegistry posts;

    address seed = address(0x5EED);
    address author = address(0xA07);
    uint256 nextVoter = 0xC0FFEE0;

    function setUp() public {
        posts = new PostRegistry(new CommunityRegistry());
        best = new BestFeed(posts);
        controversial = new ControversialFeed(posts);
    }

    /// A fresh reachable voter, so every vote carries full weight.
    function voter() internal returns (address a) {
        a = address(uint160(nextVoter++));
        Weight.trust(posts, a, 50); // a whole vote
    }

    function vote(uint256 id, uint256 ups, uint256 downs) internal {
        for (uint256 i; i < ups; ++i) {
            vm.prank(voter());
            posts.like(id);
        }
        for (uint256 i; i < downs; ++i) {
            vm.prank(voter());
            posts.dislike(id);
        }
    }

    /**
     * @dev The reason Reddit uses a confidence bound at all: a perfect record
     *      over two votes is weaker evidence than a good record over hundreds,
     *      and a plain average says the opposite.
     */
    function test_BestPrefersEvidenceOverAverage() public {
        vm.startPrank(author);
        uint256 thin = posts.post("two likes, no dislikes", "");
        uint256 thick = posts.post("ninety likes, ten dislikes", "");
        vm.stopPrank();

        vote(thin, 2, 0);
        vote(thick, 90, 10);

        uint256[] memory ids = new uint256[](2);
        ids[0] = thin;
        ids[1] = thick;

        (uint256[] memory out,) = best.rank(address(1), ids);
        assertEq(out[0], thick, "the better-evidenced post should win");
    }

    function test_BestScoresNothingWithNoVotes() public {
        vm.prank(author);
        uint256 id = posts.post("silent", "");

        uint256[] memory ids = new uint256[](1);
        ids[0] = id;

        (, uint256[] memory scores) = best.rank(address(1), ids);
        assertEq(scores[0], 0);
    }

    function test_BestRisesWithMoreAgreement() public {
        vm.startPrank(author);
        uint256 few = posts.post("few", "");
        uint256 many = posts.post("many", "");
        vm.stopPrank();

        vote(few, 5, 1);
        vote(many, 50, 10); // same ratio, ten times the evidence

        uint256[] memory ids = new uint256[](2);
        ids[0] = few;
        ids[1] = many;

        (uint256[] memory out,) = best.rank(address(1), ids);
        assertEq(out[0], many);
    }

    /// Agreement is not controversy, however loud.
    function test_ControversialIgnoresUnanimousPosts() public {
        vm.startPrank(author);
        uint256 loved = posts.post("everyone agrees", "");
        uint256 split = posts.post("nobody agrees", "");
        vm.stopPrank();

        vote(loved, 40, 0);
        vote(split, 10, 9);

        uint256[] memory ids = new uint256[](2);
        ids[0] = loved;
        ids[1] = split;

        (uint256[] memory out, uint256[] memory scores) = controversial.rank(address(1), ids);
        assertEq(out[0], split);
        assertEq(scores[1], 0, "a unanimous post is not controversial at any volume");
    }

    function test_ControversialPrefersTheEvenerSplit() public {
        vm.startPrank(author);
        uint256 lopsided = posts.post("mostly agreed", "");
        uint256 even = posts.post("evenly split", "");
        vm.stopPrank();

        vote(lopsided, 18, 2);
        vote(even, 10, 10);

        uint256[] memory ids = new uint256[](2);
        ids[0] = lopsided;
        ids[1] = even;

        (uint256[] memory out,) = controversial.rank(address(1), ids);
        assertEq(out[0], even);
    }

    /// The property that made dislikes safe to add at all.
    /// A dislike from an account the room has downvoted counts for its weight
    /// and not a whole vote: burying costs influence, so it is not free.
    function test_DownvotedDislikerCountsForLess() public {
        vm.startPrank(author);
        uint256 target = posts.post("targeted", "");
        uint256 other = posts.post("other", "");
        vm.stopPrank();

        vote(target, 10, 0);
        vote(other, 10, 0);

        address troll = address(0xBAD);
        Weight.trust(posts, troll, 50);
        vm.prank(troll);
        uint256 trollPost = posts.post("troll", "");

        Weight.trust(posts, address(1), 50);
        Weight.trust(posts, address(2), 50);
        vm.prank(address(1));
        posts.dislike(trollPost);
        vm.prank(address(2));
        posts.dislike(trollPost);

        assertEq(posts.weightOf(troll), 0);

        vm.prank(troll);
        posts.dislike(target);
        assertEq(posts.postOf(target).weightedDislikes, 0);
    }

    function test_NeitherRevertsOnEmptyInput() public view {
        uint256[] memory ids = new uint256[](0);
        best.rank(address(1), ids);
        controversial.rank(address(1), ids);
    }
}
