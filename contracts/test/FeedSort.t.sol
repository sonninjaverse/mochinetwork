// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {FeedSort} from "../src/lib/FeedSort.sol";

contract FeedSortTest is Test {
    function test_SortsDescendingAndKeepsPairs() public pure {
        uint256[] memory ids = new uint256[](4);
        uint256[] memory scores = new uint256[](4);
        ids[0] = 10;
        scores[0] = 5;
        ids[1] = 11;
        scores[1] = 90;
        ids[2] = 12;
        scores[2] = 1;
        ids[3] = 13;
        scores[3] = 50;

        (uint256[] memory outIds, uint256[] memory outScores) = FeedSort.byScoreDesc(ids, scores);

        assertEq(outIds[0], 11);
        assertEq(outScores[0], 90);
        assertEq(outIds[1], 13);
        assertEq(outIds[2], 10);
        assertEq(outIds[3], 12);
    }

    function test_EmptyArrayDoesNotRevert() public pure {
        uint256[] memory ids = new uint256[](0);
        uint256[] memory scores = new uint256[](0);
        (uint256[] memory outIds,) = FeedSort.byScoreDesc(ids, scores);
        assertEq(outIds.length, 0);
    }

    function test_SingleElementDoesNotRevert() public pure {
        uint256[] memory ids = new uint256[](1);
        uint256[] memory scores = new uint256[](1);
        ids[0] = 42;
        scores[0] = 7;
        (uint256[] memory outIds,) = FeedSort.byScoreDesc(ids, scores);
        assertEq(outIds[0], 42);
    }

    function test_AllEqualScoresDoesNotRevert() public pure {
        uint256[] memory ids = new uint256[](5);
        uint256[] memory scores = new uint256[](5);
        for (uint256 i; i < 5; ++i) {
            ids[i] = i;
            scores[i] = 3;
        }
        (uint256[] memory outIds,) = FeedSort.byScoreDesc(ids, scores);
        assertEq(outIds.length, 5);
    }

    /// @dev Ranking runs on up to 500 candidates; this proves the sort holds up.
    function testFuzz_OutputIsDescendingAndPreservesMembership(uint16[50] memory raw) public pure {
        uint256[] memory ids = new uint256[](50);
        uint256[] memory scores = new uint256[](50);
        uint256 sumBefore;
        for (uint256 i; i < 50; ++i) {
            ids[i] = i;
            scores[i] = raw[i];
            sumBefore += raw[i];
        }

        (uint256[] memory outIds, uint256[] memory outScores) = FeedSort.byScoreDesc(ids, scores);

        uint256 sumAfter;
        uint256 idSum;
        for (uint256 i; i < 50; ++i) {
            sumAfter += outScores[i];
            idSum += outIds[i];
            if (i > 0) assertGe(outScores[i - 1], outScores[i]);
        }
        assertEq(sumAfter, sumBefore);
        assertEq(idSum, 1225); // 0 + 1 + ... + 49, so no id was lost or duplicated
    }
}
