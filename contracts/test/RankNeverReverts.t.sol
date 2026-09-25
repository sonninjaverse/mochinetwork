// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {PostRegistry} from "../src/PostRegistry.sol";
import {CommunityRegistry} from "../src/CommunityRegistry.sol";
import {IFeedAlgorithm} from "../src/interfaces/IFeedAlgorithm.sol";
import {ChronoFeed} from "../src/algorithms/ChronoFeed.sol";
import {HotFeed} from "../src/algorithms/HotFeed.sol";
import {BestFeed} from "../src/algorithms/BestFeed.sol";
import {ControversialFeed} from "../src/algorithms/ControversialFeed.sol";

/// @notice A reverting rank() renders as a blank feed, so every shipped
///         algorithm must tolerate any input the client can produce.
contract RankNeverRevertsTest is Test {
    PostRegistry posts;
    IFeedAlgorithm[] algos;

    address seed = address(0x5EED);
    address author = address(0xA07);

    function setUp() public {
        posts = new PostRegistry(new CommunityRegistry());

        algos.push(new ChronoFeed(posts));
        algos.push(new HotFeed(posts, block.timestamp));
        algos.push(new BestFeed(posts));
        algos.push(new ControversialFeed(posts));

        for (uint256 i; i < 5; ++i) {
            vm.prank(author);
            posts.post("a post", "");
        }
    }

    /// @dev Covers unknown ids, id zero, duplicates and arbitrary viewers.
    function testFuzz_NoAlgorithmRevertsOnArbitraryInput(uint256[16] memory rawIds, address viewer)
        public
        view
    {
        uint256[] memory ids = new uint256[](16);
        for (uint256 i; i < 16; ++i) {
            ids[i] = rawIds[i];
        }

        for (uint256 a; a < algos.length; ++a) {
            (uint256[] memory out, uint256[] memory scores) = algos[a].rank(viewer, ids);
            assertEq(out.length, 16);
            assertEq(scores.length, 16);
        }
    }

    function test_NoAlgorithmRevertsOnEmptyInput() public view {
        uint256[] memory ids = new uint256[](0);
        for (uint256 a; a < algos.length; ++a) {
            (uint256[] memory out,) = algos[a].rank(address(0), ids);
            assertEq(out.length, 0);
        }
    }

    /// @dev A post timestamped in the future must not underflow the age maths.
    function test_NoAlgorithmRevertsOnFutureTimestamp() public {
        vm.prank(author);
        uint256 id = posts.post("from the future", "");

        uint256[] memory ids = new uint256[](1);
        ids[0] = id;

        vm.warp(1); // now earlier than createdAt
        for (uint256 a; a < algos.length; ++a) {
            algos[a].rank(seed, ids);
        }
    }
}
