// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {BestFeed} from "../src/algorithms/BestFeed.sol";
import {PostRegistry} from "../src/PostRegistry.sol";
import {CommunityRegistry} from "../src/CommunityRegistry.sol";
import {Weight} from "./lib/Weight.sol";

/**
 * @notice Checks the on-chain Wilson bound against reddit's own numbers.
 *
 * @dev A project whose claim is that the algorithm is legible cannot ship a
 *      formula that only approximately resembles the one it names. These four
 *      values come from running reddit's _confidence() in Python with their z
 *      of 1.281551565545.
 */
contract WilsonParityTest is Test {
    BestFeed best;
    PostRegistry posts;

    address seed = address(0x5EED);
    address author = address(0xA07);
    uint256 nextVoter = 0xC0FFEE0;

    function setUp() public {
        posts = new PostRegistry(new CommunityRegistry());
        best = new BestFeed(posts);
    }

    function scoreFor(uint256 ups, uint256 downs) internal returns (uint256) {
        vm.prank(author);
        uint256 id = posts.post("x", "");

        for (uint256 i; i < ups + downs; ++i) {
            address a = address(uint160(nextVoter++));
            // A whole vote is 100 weight; the ladder starts at 1.
            Weight.trust(posts, a, 50);
            vm.prank(a);
            if (i < ups) posts.like(id);
            else posts.dislike(id);
        }

        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        (, uint256[] memory scores) = best.rank(address(1), ids);
        return scores[0];
    }

    /// Within 0.5% of reddit's float output on each case.
    function test_MatchesRedditsOwnNumbers() public {
        assertApproxEqRel(scoreFor(2, 0), 0.5491e18, 0.005e18, "2 up, 0 down");
        assertApproxEqRel(scoreFor(90, 10), 0.8549e18, 0.005e18, "90 up, 10 down");
        assertApproxEqRel(scoreFor(5, 1), 0.5747e18, 0.005e18, "5 up, 1 down");
        assertApproxEqRel(scoreFor(50, 10), 0.7630e18, 0.005e18, "50 up, 10 down");
    }
}
