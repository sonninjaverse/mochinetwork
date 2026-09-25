// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IFeedAlgorithm} from "../interfaces/IFeedAlgorithm.sol";
import {PostRegistry} from "../PostRegistry.sol";
import {FeedSort} from "../lib/FeedSort.sol";
import {Log} from "../lib/Log.sol";

/**
 * @notice Reddit's "hot" ranking, unchanged, running on chain.
 *
 *   order = log10(max(|ups - downs|, 1))
 *   score = sign * order + seconds / 45000
 *
 * From reddit's _sorts.pyx, which they published in 2010. Reddit has no
 * downvotes here, so sign is always positive and the formula reduces to
 * log10(likes) + age.
 *
 * @dev The reason to ship someone else's algorithm rather than only our own:
 *      a formula people already recognise makes the claim concrete. "You can
 *      run any ranking you like" is an assertion; "here is Reddit's, switch to
 *      it" is a demonstration.
 *
 *      The shape is worth understanding before using it. The time term grows by
 *      one point every 45,000 seconds while the vote term is logarithmic, so a
 *      post 12.5 hours older needs ten times the votes to hold its place. That
 *      is what makes a small community able to push something to the top — not
 *      volume, but volume inside a narrow window.
 */
contract HotFeed is IFeedAlgorithm {
    PostRegistry public immutable posts;

    /// Reddit anchors to the day they launched this ranking. We anchor to the
    /// day this network did, for the same reason: it keeps the time term at a
    /// size where the vote term still registers.
    uint256 public immutable epoch;

    uint256 private constant DECAY_SECONDS = 45_000;

    /// weightOf returns 0..100, so a single full-weight like arrives as 100.
    /// Reddit's formula counts a vote as 1, and feeding it hundreds instead
    /// shifts the logarithm up by two whole points — enough for the vote term
    /// to swamp the time term and invert the behaviour the formula exists for.
    uint256 private constant WEIGHT_SCALE = 100;

    constructor(PostRegistry posts_, uint256 epoch_) {
        posts = posts_;
        epoch = epoch_;
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

            // weightedLikes, not likeCount: a ring of unreachable wallets moves
            // the raw counter and would otherwise ride the logarithm straight
            // to the top, which is exactly what this formula rewards.
            //
            // Scaled back to whole votes first, so one trusted like is one vote
            // and the calibration matches Reddit's.
            uint256 votes = ps[i].weightedLikes / WEIGHT_SCALE;
            uint256 order = Log.log10Int(votes);

            uint256 age = ps[i].createdAt > epoch ? ps[i].createdAt - epoch : 0;
            scores[i] = order + (age * 1e18) / DECAY_SECONDS;
        }

        return FeedSort.byScoreDesc(ids, scores);
    }

    function name() external pure returns (string memory) {
        return "Hot";
    }

    function description() external pure returns (string memory) {
        return
            "Reddit's hot ranking, unchanged. Votes count logarithmically and every 12.5 hours a post needs ten times as many to hold its place.";
    }
}
