// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice A complete, standalone example of a feed algorithm for Mochi.
///
/// Ranks by net weighted votes and nothing else: no time decay, no confidence
/// interval, no filtering. A post from last week that people liked outranks a
/// post from this morning that they did not. That is an opinion the shipped
/// algorithms do not hold, which is the point — this file exists to be copied
/// and changed.
///
/// Deliberately self-contained. It declares the slice of PostRegistry it reads
/// rather than importing this repository, so it can be pasted into Remix or any
/// empty Foundry project and deployed as it is.
///
/// Rules a feed algorithm must keep:
///   1. `rank` is `view`. Clients call it with eth_call, so it costs the reader
///      nothing and needs no wallet.
///   2. `rank` must never revert, for any input. A revert reaches the reader as
///      an empty feed, with nothing to say why.
///   3. Return both arrays at the same length, `scores[i]` belonging to
///      `orderedIds[i]`.
///   4. Unknown ids are normal. The client passes whatever its indexer found;
///      an id this contract cannot read must score low, not throw.
interface IPostRegistry {
    struct Post {
        address author;
        uint48 createdAt;
        uint48 parentId;
        uint32 likeCount;
        uint32 weightedLikes;
        uint32 dislikeCount;
        uint32 weightedDislikes;
        uint32 repostCount;
        uint32 replyCount;
        // Present so the tuple decodes; this feed does not use it.
        bytes32 community;
    }

    /// One call for the whole candidate set. Reading posts one at a time works
    /// but turns a single eth_call into hundreds of storage reads.
    function postsOf(uint256[] calldata ids) external view returns (Post[] memory);
}

contract NetVotesFeed {
    IPostRegistry public immutable posts;

    constructor(IPostRegistry posts_) {
        posts = posts_;
    }

    function rank(address, uint256[] calldata candidateIds)
        external
        view
        returns (uint256[] memory orderedIds, uint256[] memory scores)
    {
        IPostRegistry.Post[] memory ps = posts.postsOf(candidateIds);

        orderedIds = new uint256[](candidateIds.length);
        scores = new uint256[](candidateIds.length);

        for (uint256 i; i < candidateIds.length; ++i) {
            orderedIds[i] = candidateIds[i];

            // weightedLikes and weightedDislikes are already filtered by
            // karma: a vote counts whatever the voter's own karma made it worth
            // when it landed, so a ring of fresh wallets is worth a hundredth
            // of one trusted vote. Using the raw counts instead is what a sybil
            // ring is built to exploit.
            uint256 up = ps[i].weightedLikes;
            uint256 down = ps[i].weightedDislikes;

            // Scores are unsigned, so a post underwater has to floor at zero
            // rather than wrap around to an enormous number. An unknown id
            // lands here too: it reads back as an empty Post and scores 0.
            scores[i] = up > down ? up - down : 0;
        }

        _sortDesc(orderedIds, scores);
    }

    function name() external pure returns (string memory) {
        return "Net votes";
    }

    function description() external pure returns (string memory) {
        return "Weighted likes minus dislikes. No time decay: good posts stay up.";
    }

    /// Insertion sort, in place, highest score first.
    ///
    /// Quadratic, which is fine here and worth knowing why: this runs inside
    /// eth_call against a candidate set the client caps in the hundreds, and it
    /// never costs anyone gas. Sorting on chain in a transaction would be a
    /// different decision entirely.
    function _sortDesc(uint256[] memory ids, uint256[] memory scores) private pure {
        for (uint256 i = 1; i < ids.length; ++i) {
            uint256 score = scores[i];
            uint256 id = ids[i];
            uint256 j = i;
            while (j > 0 && scores[j - 1] < score) {
                scores[j] = scores[j - 1];
                ids[j] = ids[j - 1];
                --j;
            }
            scores[j] = score;
            ids[j] = id;
        }
    }
}
