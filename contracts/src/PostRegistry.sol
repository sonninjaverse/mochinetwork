// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {CommunityRegistry} from "./CommunityRegistry.sol";

/// @notice Posts, engagement and karma for Mochi Network.
/// @dev Post text never enters storage; it lives in PostCreated event data and
///      is reconstructed by the indexer. Only fields a ranking contract reads
///      are stored, which is what keeps a post down to a few slots.
///
///      Vote weight and karma live here together on purpose. An account's
///      weight is a function of the karma it has earned, and every vote writes
///      both — so the number a client shows is the same number the ranking
///      contracts used, and anyone can read it back from the chain. There is no
///      separate reputation service to trust.
contract PostRegistry {
    error EmptyText();
    error NoSuchPost();
    error CannotVoteSelf();
    error TextTooLong();
    error MediaUriTooLong();
    error NotAMember();

    /// @dev The client counts 280 characters; one UTF-8 character is at most
    ///      three bytes, so 1024 lets every client-legal post through while
    ///      stopping a payload that would bloat the event log and the indexer.
    uint256 private constant MAX_TEXT_BYTES = 1024;

    /// @dev `ipfs://` plus a CIDv1 is under 70 bytes. Anything longer is not a
    ///      content address the client can render.
    uint256 private constant MAX_URI_BYTES = 256;

    struct Post {
        // --- slot 1 ---
        address author; // 160 bits
        uint48 createdAt; // 48 bits
        uint48 parentId; // 0 for a top-level post, else the post replied to
        // --- slot 2 ---
        uint32 likeCount; // raw likes
        uint32 weightedLikes; // likes filtered by weightOf
        // --- slot 3 ---
        uint32 dislikeCount; // raw dislikes
        uint32 weightedDislikes; // dislikes filtered the same way
        uint32 repostCount; // reserved
        uint32 replyCount;
        // --- slot 4 ---
        // The community a post belongs to, zero-padded like its name. Zero
        // means no community, which is what a reply inherits from its parent.
        bytes32 community;
    }

    /// @notice Communities, asked one question: has this account joined?
    /// @dev A community post may only be written by a member. The tag used to
    ///      live in the post's text alone, where the contract could not see it;
    ///      joining could then be ignored. A post carries its community now, so
    ///      the refusal is part of the contract rather than a client's manners.
    CommunityRegistry public immutable communities;

    /// @dev Ids start at 1 so that parentId == 0 can mean "no parent".
    uint256 public nextPostId = 1;

    constructor(CommunityRegistry communities_) {
        communities = communities_;
    }

    mapping(uint256 => Post) private _posts;

    mapping(uint256 => mapping(address => bool)) public hasLiked;
    mapping(uint256 => mapping(address => bool)) public hasDisliked;

    /// @dev The weight a vote actually carried when it was cast. Kept so a
    ///      withdrawal subtracts exactly what the vote added: weight is a
    ///      function of karma, and karma moves, so reading it again at
    ///      withdrawal time would leave the ledger drifting.
    mapping(uint256 => mapping(address => uint32)) private _likeWeight;
    mapping(uint256 => mapping(address => uint32)) private _dislikeWeight;

    /// @notice Signed reputation: weighted likes received minus weighted
    ///         dislikes received, across every post this account has written.
    /// @dev Self-votes are refused outright, so this cannot be farmed by liking
    ///      your own posts. It is the whole ledger, and it is public.
    mapping(address => int256) public karmaOf;

    /// @dev parentId and mediaURI ride along here rather than in storage.
    ///      Only parentId is also stored, because ranking has to be able to
    ///      tell a reply from a post; nothing ranks on an image URI.
    event PostCreated(
        uint256 indexed id,
        address indexed author,
        uint48 createdAt,
        uint48 parentId,
        bytes32 community,
        string text,
        string mediaURI
    );
    event Liked(uint256 indexed id, address indexed account, uint32 weight);
    event Unliked(uint256 indexed id, address indexed account);
    event Disliked(uint256 indexed id, address indexed account, uint32 weight);
    event Undisliked(uint256 indexed id, address indexed account);

    /**
     * @notice How much this account's vote counts, from the karma it has earned.
     *
     * @dev A fresh account starts at 1, not at a whole vote. Every account can
     *      still vote on day one, but a stranger's vote is worth one per cent of
     *      a vote, and it takes a hundred of them to move a feed the way one
     *      trusted account does. A ring has to spend a hundred wallets per unit
     *      of influence instead of the two it would with a whole vote each.
     *
     *      Karma raises it from there. 50 karma — which is to say, fifty
     *      distinct accounts having upvoted your writing — is one whole vote,
     *      and 5000 is the cap at two. A feed decided by a few high-karma
     *      accounts is the thing reputation systems get criticised for, and
     *      the cap is what keeps this one out of it.
     *
     *      Karma below zero is silenced outright: a downvoted account's vote is
     *      worth nothing until the room upvotes it back above zero. It is not
     *      permanent — others can restore it — but it can no longer be its own
     *      rescue, which a floor of one still allowed.
     */
    function weightOf(address account) public view returns (uint32) {
        int256 k = karmaOf[account];
        if (k >= 5000) return 200;
        if (k >= 1000) return 150;
        if (k >= 200) return 125;
        if (k >= 50) return 100;
        if (k >= 10) return 25;
        if (k >= 1) return 5;
        if (k >= 0) return 1;
        return 0;
    }

    function postOf(uint256 id) external view returns (Post memory) {
        return _posts[id];
    }

    /// @param mediaURI Empty, or a content address such as `ipfs://<cid>`.
    ///        Never fetched on chain and never stored — the client resolves it.
    function post(string calldata text, string calldata mediaURI)
        external
        returns (uint256 id)
    {
        return _create(text, mediaURI, 0, bytes32(0));
    }

    /// @notice Posts into a community. The author must have joined it.
    function postToCommunity(bytes32 community, string calldata text, string calldata mediaURI)
        external
        returns (uint256 id)
    {
        if (community == bytes32(0) || communities.joinedAt(community, msg.sender) == 0) {
            revert NotAMember();
        }
        return _create(text, mediaURI, 0, community);
    }

    /// @notice Replies to `parentId`, which may itself be a reply.
    /// @dev Only the direct parent is stored. Threading is a reading decision,
    ///      and storing a root as well would be a second thing to keep true.
    ///      A reply inherits its parent's community and, like a comment
    ///      anywhere, does not require joining first.
    function reply(uint48 parentId, string calldata text, string calldata mediaURI)
        external
        returns (uint256 id)
    {
        Post storage parent = _posts[parentId];
        if (parent.author == address(0)) revert NoSuchPost();

        id = _create(text, mediaURI, parentId, parent.community);
        parent.replyCount += 1;
    }

    function _create(
        string calldata text,
        string calldata mediaURI,
        uint48 parentId,
        bytes32 community
    ) private returns (uint256 id) {
        // An image on its own is a post. Nothing at all is not.
        if (bytes(text).length == 0 && bytes(mediaURI).length == 0) revert EmptyText();
        if (bytes(text).length > MAX_TEXT_BYTES) revert TextTooLong();
        if (bytes(mediaURI).length > MAX_URI_BYTES) revert MediaUriTooLong();

        id = nextPostId++;
        _posts[id] = Post({
            author: msg.sender,
            createdAt: uint48(block.timestamp),
            parentId: parentId,
            likeCount: 0,
            weightedLikes: 0,
            dislikeCount: 0,
            weightedDislikes: 0,
            repostCount: 0,
            replyCount: 0,
            community: community
        });

        emit PostCreated(id, msg.sender, uint48(block.timestamp), parentId, community, text, mediaURI);
    }

    /// @dev Ranking reads up to 500 candidates per call. One batched read beats
    ///      500 external calls and keeps rank latency flat as the window grows.
    function postsOf(uint256[] calldata ids) external view returns (Post[] memory out) {
        out = new Post[](ids.length);
        for (uint256 i; i < ids.length; ++i) {
            out[i] = _posts[ids[i]];
        }
    }

    function like(uint256 id) external {
        Post storage p = _posts[id];
        if (p.author == address(0)) revert NoSuchPost();
        if (msg.sender == p.author) revert CannotVoteSelf();
        if (hasLiked[id][msg.sender]) return;

        // A vote is one direction at a time, the way Reddit works. Liking
        // something you had disliked withdraws the dislike rather than leaving
        // the post counted in both columns.
        if (hasDisliked[id][msg.sender]) _clearDislike(p, id);

        hasLiked[id][msg.sender] = true;
        uint32 weight = weightOf(msg.sender);
        _likeWeight[id][msg.sender] = weight;

        p.likeCount += 1;
        p.weightedLikes += weight;
        karmaOf[p.author] += int256(uint256(weight));

        emit Liked(id, msg.sender, weight);
    }

    function unlike(uint256 id) external {
        Post storage p = _posts[id];
        if (p.author == address(0)) revert NoSuchPost();
        if (!hasLiked[id][msg.sender]) return;
        _clearLike(p, id);
    }

    /**
     * @notice Vote a post down.
     *
     * @dev Weighted exactly as a like is, and it moves karma the same way in
     *      reverse. Reddit's Best and Controversial sorts are meaningless
     *      without this signal — one is a confidence interval over agreement,
     *      the other a measure of disagreement — and a downvote has to cost the
     *      author something or it is only a dislike button.
     */
    function dislike(uint256 id) external {
        Post storage p = _posts[id];
        if (p.author == address(0)) revert NoSuchPost();
        if (msg.sender == p.author) revert CannotVoteSelf();
        if (hasDisliked[id][msg.sender]) return;

        if (hasLiked[id][msg.sender]) _clearLike(p, id);

        hasDisliked[id][msg.sender] = true;
        uint32 weight = weightOf(msg.sender);
        _dislikeWeight[id][msg.sender] = weight;

        p.dislikeCount += 1;
        p.weightedDislikes += weight;
        karmaOf[p.author] -= int256(uint256(weight));

        emit Disliked(id, msg.sender, weight);
    }

    function undislike(uint256 id) external {
        Post storage p = _posts[id];
        if (p.author == address(0)) revert NoSuchPost();
        if (!hasDisliked[id][msg.sender]) return;
        _clearDislike(p, id);
    }

    function _clearLike(Post storage p, uint256 id) private {
        hasLiked[id][msg.sender] = false;
        uint32 weight = _likeWeight[id][msg.sender];
        delete _likeWeight[id][msg.sender];

        p.likeCount -= 1;
        p.weightedLikes = weight > p.weightedLikes ? 0 : p.weightedLikes - weight;
        karmaOf[p.author] -= int256(uint256(weight));

        emit Unliked(id, msg.sender);
    }

    function _clearDislike(Post storage p, uint256 id) private {
        hasDisliked[id][msg.sender] = false;
        uint32 weight = _dislikeWeight[id][msg.sender];
        delete _dislikeWeight[id][msg.sender];

        p.dislikeCount -= 1;
        p.weightedDislikes = weight > p.weightedDislikes ? 0 : p.weightedDislikes - weight;
        karmaOf[p.author] += int256(uint256(weight));

        emit Undisliked(id, msg.sender);
    }
}
