// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IFeedAlgorithm} from "../interfaces/IFeedAlgorithm.sol";
import {PostRegistry} from "../PostRegistry.sol";
import {FeedSort} from "../lib/FeedSort.sol";

/// @notice Reverse chronological feed: the baseline, "no algorithm at all".
contract ChronoFeed is IFeedAlgorithm {
    PostRegistry public immutable posts;

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
            // An unknown id has author == address(0) and createdAt == 0, which
            // scores 0 and sinks to the bottom without reverting.
            scores[i] = ps[i].createdAt;
        }

        return FeedSort.byScoreDesc(ids, scores);
    }

    function name() external pure returns (string memory) {
        return "Chrono";
    }

    function description() external pure returns (string memory) {
        return "Newest first. No ranking, no filtering, no opinion.";
    }
}
