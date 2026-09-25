// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {HotFeed} from "../../src/algorithms/HotFeed.sol";
import {PostRegistry} from "../../src/PostRegistry.sol";
import {CommunityRegistry} from "../../src/CommunityRegistry.sol";
import {Weight} from "../lib/Weight.sol";

contract HotFeedTest is Test {
    HotFeed feed;
    PostRegistry posts;

    address seed = address(0x5EED);
    address author = address(0xA07);
    uint256 epoch;

    function setUp() public {
        vm.warp(1_700_000_000);
        epoch = block.timestamp;
        posts = new PostRegistry(new CommunityRegistry());
        feed = new HotFeed(posts, epoch);
    }

    /// Give `n` distinct accounts with a whole vote each a like on `id`.
    function like(uint256 id, uint256 n) internal {
        for (uint256 i; i < n; ++i) {
            address liker = address(uint160(0xC0FFEE0 + i));
            Weight.trust(posts, liker, 50);
            vm.prank(liker);
            posts.like(id);
        }
    }

    function test_MoreVotesWinsAtEqualAge() public {
        vm.startPrank(author);
        uint256 quiet = posts.post("quiet", "");
        uint256 loud = posts.post("loud", "");
        vm.stopPrank();

        like(loud, 5);

        uint256[] memory ids = new uint256[](2);
        ids[0] = quiet;
        ids[1] = loud;

        (uint256[] memory out,) = feed.rank(address(1), ids);
        assertEq(out[0], loud);
    }

    /**
     * @dev The property the whole formula exists for, and the one that made
     *      r/wallstreetbets possible: a post from the last twelve hours beats
     *      an older one unless the older one has an order of magnitude more
     *      votes. Recency wins by default; concentrated votes overturn it.
     */
    function test_NewerPostBeatsOlderPostWithSimilarVotes() public {
        vm.prank(author);
        uint256 old = posts.post("old", "");
        like(old, 8);

        vm.warp(block.timestamp + 13 hours);

        vm.prank(author);
        uint256 fresh = posts.post("fresh", "");
        like(fresh, 8);

        uint256[] memory ids = new uint256[](2);
        ids[0] = old;
        ids[1] = fresh;

        (uint256[] memory out,) = feed.rank(address(1), ids);
        assertEq(out[0], fresh);
    }

    /**
     * @dev The converse, and the exact trade Reddit's constants encode: ten
     *      times the votes buys back one 12.5-hour step. This is the lever a
     *      community pulls when it concentrates votes in a narrow window.
     */
    function test_TenTimesTheVotesBuysBackOneDecayStep() public {
        vm.prank(author);
        uint256 old = posts.post("old", "");
        like(old, 30);

        vm.warp(block.timestamp + 12 hours);

        vm.prank(author);
        uint256 fresh = posts.post("fresh", "");
        like(fresh, 3);

        uint256[] memory ids = new uint256[](2);
        ids[0] = fresh;
        ids[1] = old;

        // Ten times the votes against twelve hours: close enough that the two
        // are still competing, which is the whole design.
        (, uint256[] memory scores) = feed.rank(address(1), ids);
        uint256 gap = scores[0] > scores[1] ? scores[0] - scores[1] : scores[1] - scores[0];
        assertLt(gap, 2e17, "ten times the votes should roughly cancel 12 hours");
    }

    /// One trusted like must count as one vote, not as its weight of 100.
    function test_VotesAreScaledToWholeVotes() public {
        vm.prank(author);
        uint256 id = posts.post("a", "");
        like(id, 10);

        uint256[] memory ids = new uint256[](1);
        ids[0] = id;

        (, uint256[] memory scores) = feed.rank(address(1), ids);
        // log10(10) == 1, plus a zero time term at the epoch.
        assertApproxEqRel(scores[0], 1e18, 0.01e18);
    }

    /// Weight is karma, so an account the room has downvoted carries less
    /// influence than one it agrees with.
    function test_DownvotedVoterCountsForLess() public {
        vm.prank(author);
        uint256 honest = posts.post("honest", "");

        // A trusted account the room then turns on: 50 karma is a whole vote,
        // and two full-weight dislikes take it to the floor.
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
        posts.like(honest);
        assertEq(posts.postOf(honest).weightedLikes, 0);
    }

    function test_EmptyCandidatesDoesNotRevert() public view {
        uint256[] memory ids = new uint256[](0);
        (uint256[] memory out,) = feed.rank(address(1), ids);
        assertEq(out.length, 0);
    }

    function test_MetadataStrings() public view {
        assertEq(feed.name(), "Hot");
        assertGt(bytes(feed.description()).length, 0);
    }
}
