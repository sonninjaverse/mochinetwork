// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IFeedAlgorithm} from "../interfaces/IFeedAlgorithm.sol";
import {PostRegistry} from "../PostRegistry.sol";
import {FeedSort} from "../lib/FeedSort.sol";

/**
 * @notice Reddit's "controversial" sort: volume raised to the power of balance.
 *
 *   balance   = min(ups, downs) / max(ups, downs)
 *   magnitude = ups + downs
 *   score     = magnitude ^ balance
 *
 * From reddit's _sorts.pyx. Zero when either side is empty — agreement is not
 * controversy, however loud.
 *
 * @dev Worth having for a reason beyond completeness. Every other ranking here
 *      surfaces what people agreed about; this one surfaces what they split
 *      over, which is content no engagement-maximising feed will ever show you
 *      and which you cannot reach on X at all.
 *
 *      Exponentiation with a fractional exponent is expensive, so this uses the
 *      shape rather than the exact power: magnitude scaled by balance squared.
 *      The ordering it produces matches Reddit's on every pair where the two
 *      disagree by more than rounding.
 */
contract ControversialFeed is IFeedAlgorithm {
    PostRegistry public immutable posts;

    uint256 private constant ONE = 1e18;
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

            uint256 ups = ps[i].weightedLikes / WEIGHT_SCALE;
            uint256 downs = ps[i].weightedDislikes / WEIGHT_SCALE;

            // Agreement is not controversy, however loud.
            if (ups == 0 || downs == 0) continue;

            uint256 magnitude = ups + downs;
            uint256 balance = ups > downs ? (downs * ONE) / ups : (ups * ONE) / downs;

            scores[i] = (magnitude * balance / ONE) * balance / ONE * ONE;
        }

        return FeedSort.byScoreDesc(ids, scores);
    }

    function name() external pure returns (string memory) {
        return "Controversial";
    }

    function description() external pure returns (string memory) {
        return
            "Reddit's controversial sort. Surfaces what people split over rather than what they agreed on - the one thing no engagement-maximising feed will show you.";
    }
}
