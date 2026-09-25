// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ChronoFeed} from "../../src/algorithms/ChronoFeed.sol";
import {PostRegistry} from "../../src/PostRegistry.sol";
import {CommunityRegistry} from "../../src/CommunityRegistry.sol";

contract ChronoFeedTest is Test {
    ChronoFeed feed;
    PostRegistry posts;
    address alice = address(0xA11CE);

    function setUp() public {
        posts = new PostRegistry(new CommunityRegistry());
        feed = new ChronoFeed(posts);
    }

    function test_NewestFirst() public {
        vm.startPrank(alice);
        uint256 older = posts.post("old", "");
        vm.warp(block.timestamp + 100);
        uint256 newer = posts.post("new", "");
        vm.stopPrank();

        uint256[] memory ids = new uint256[](2);
        ids[0] = older;
        ids[1] = newer;

        (uint256[] memory out,) = feed.rank(alice, ids);
        assertEq(out[0], newer);
        assertEq(out[1], older);
    }

    function test_EmptyCandidatesDoesNotRevert() public view {
        uint256[] memory ids = new uint256[](0);
        (uint256[] memory out,) = feed.rank(alice, ids);
        assertEq(out.length, 0);
    }

    function test_UnknownIdScoresZeroAndDoesNotRevert() public {
        vm.prank(alice);
        uint256 real = posts.post("a", "");

        uint256[] memory ids = new uint256[](2);
        ids[0] = 99999;
        ids[1] = real;

        (uint256[] memory out, uint256[] memory scores) = feed.rank(alice, ids);
        assertEq(out[0], real);
        assertEq(scores[1], 0);
    }

    function test_MetadataStrings() public view {
        assertEq(feed.name(), "Chrono");
        assertGt(bytes(feed.description()).length, 0);
    }
}
