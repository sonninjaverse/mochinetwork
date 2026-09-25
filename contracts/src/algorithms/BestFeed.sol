// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IFeedAlgorithm} from "../interfaces/IFeedAlgorithm.sol";
import {PostRegistry} from "../PostRegistry.sol";
import {FeedSort} from "../lib/FeedSort.sol";
import {Log} from "../lib/Log.sol";

/**
 * @notice Reddit's "best" sort: the lower bound of a Wilson score interval.
 *
 *   p = ups / n,  n = ups + downs
 *   lower = (p + z²/2n − z·√(p(1−p)/n + z²/4n²)) / (1 + z²/n)
 *
 * From reddit's _sorts.pyx, with their z of 1.281551565545 — an 80% confidence
 * bound rather than the 95% most write-ups quote.
 *
 * @dev The point of the interval is that it asks how confident we can be, not
 *      what the average is. Two likes and no dislikes looks perfect and means
 *      almost nothing; 900 likes against 50 dislikes is a worse ratio and far
 *      better evidence. A plain average ranks the first above the second, which
 *      is how new posts with one friendly vote end up on top of everything.
 */
contract BestFeed is IFeedAlgorithm {
    PostRegistry public immutable posts;

    uint256 private constant ONE = 1e18;
    /// Reddit's z, 80% confidence, in 1e18 fixed point.
    uint256 private constant Z = 1_281551565545000000;
    uint256 private constant WEIGHT_SCALE = 100;

    constructor(PostRegistry posts_) {
        posts = posts_;
    }

    function rank(address, uint256[] calldata candidateIds)
        external
        view
        returns (uint256[] memory, uint256[] memory)
    {
        PostRegistry.Post[] memory ps = posts.postsOf(candidateIds);

        uint256[] memory ids = new uint256[](candidateIds.length);
        uint256[] memory scores = new uint256[](candidateIds.length);

        for (uint256 i; i < candidateIds.length; ++i) {
            ids[i] = candidateIds[i];
            if (ps[i].author == address(0)) continue;

            // Weighted, then scaled back to whole votes — an unreachable
            // account neither raises nor lowers anyone's confidence.
            uint256 ups = ps[i].weightedLikes / WEIGHT_SCALE;
            uint256 downs = ps[i].weightedDislikes / WEIGHT_SCALE;
            scores[i] = _confidence(ups, downs);
        }

        return FeedSort.byScoreDesc(ids, scores);
    }

    function _confidence(uint256 ups, uint256 downs) private pure returns (uint256) {
        uint256 n = ups + downs;
        if (n == 0) return 0;

        uint256 p = (ups * ONE) / n;
        uint256 zz = (Z * Z) / ONE;

        // zz is already 1e18-scaled, so dividing by 2n keeps the scale. The
        // extra factor of ONE that was here made every thin post look certain.
        uint256 left = p + zz / (2 * n);
        uint256 inner = (p * (ONE - p)) / ONE / n + zz / (4 * n * n);
        uint256 right = (Z * Log.sqrt(inner)) / ONE;
        uint256 under = ONE + zz / n;

        if (right >= left) return 0;
        return ((left - right) * ONE) / under;
    }

    function name() external pure returns (string memory) {
        return "Best";
    }

    function description() external pure returns (string memory) {
        return
            "Reddit's best sort. Ranks by how confident the votes make us, not by the average, so one friendly vote does not beat nine hundred.";
    }
}
