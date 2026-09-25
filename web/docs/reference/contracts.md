# Contracts and addresses

Chain id **10143** (Monad testnet), RPC `https://testnet-rpc.monad.xyz`,
explorer [testnet.monadscan.com](https://testnet.monadscan.com).

## Deployed addresses

| Contract | Address | Block |
|---|---|---|
| IdentityRegistry | `0xa67ef35974bc8874318d249b6e74c7bd5870d1db` | 63285812 |
| CommunityRegistry | `0x41c19889a3218000482a1cd6e13640edcd16cf32` | 63285812 |
| PostRegistry | `0x894a39b3Fc34106c0B4724aab8cbB459b8184D46` | 63656426 |
| ChronoFeed | `0x77b9fE5CBAB95453f5aAAB24d3c2de874B62E484` | 63656426 |
| HotFeed | `0xC52462A8d74c8E1A76D7d53e0e5CA32fF1c75f40` | 63656426 |
| BestFeed | `0x58298dFb756Ca8400d1d36F8268E4786C9a64d9B` | 63656426 |
| ControversialFeed | `0x76953BcFd5AB00aAd3f0c0Fee0bAbaf92031985D` | 63656426 |
| AlgorithmRegistry | `0xFA1Db0d75b316579099eAf0A986690B68f9e8b21` | 63656426 |

**No contract has an admin function.** Even the development team cannot remove an
algorithm, delete a post, or ban an account.

## PostRegistry

Holds posts, votes, **and the entire karma ledger**.

```solidity
uint256 public nextPostId = 1;
mapping(address => int256) public karmaOf;
mapping(uint256 => mapping(address => bool)) public hasLiked;
mapping(uint256 => mapping(address => bool)) public hasDisliked;

struct Post {
    address author;
    uint48  createdAt;
    uint48  parentId;         // 0 = post, non-zero = comment
    uint32  likeCount;        // raw
    uint32  weightedLikes;    // weighted
    uint32  dislikeCount;     // raw
    uint32  weightedDislikes; // weighted
    uint32  repostCount;      // reserved
    uint32  replyCount;
    bytes32 community;        // the community it belongs to; zero means none
}

CommunityRegistry public immutable communities;

function post(string text, string mediaURI) external;   // a post with no community
function postToCommunity(bytes32 community, string text, string mediaURI) external; // reverts NotAMember
function reply(uint48 parentId, string text, string mediaURI) external;             // inherits
function postOf(uint256 id) external view returns (Post memory);
function postsOf(uint256[] ids) external view returns (Post[] memory);

function like(uint256 id) external;
function dislike(uint256 id) external;
function unlike(uint256 id) external;
function undislike(uint256 id) external;

function karmaOf(address) external view returns (int256);   // 100 points = 1 vote
function weightOf(address) external view returns (uint32);  // 0–200
```

Events: `PostCreated`, `Liked(id, account, weight)`, `Unliked`,
`Disliked(id, account, weight)`, `Undisliked`.

Rules: you cannot vote on your own post; unvoting returns **exactly the weight that
was added**; if karma is negative, weight is 0. See [Karma and weight](/guide/karma).

## IdentityRegistry

Name and metadata, nothing else.

```solidity
function register(bytes32 handle, string metadataURI) external;
function changeHandle(bytes32 newHandle) external;   // releases the old name
function setMetadata(string metadataURI) external;
```

Events: `Registered`, `HandleChanged`, `MetadataUpdated`. A handle is `bytes32`,
3–15 characters `a–z0–9_`. Changing a name releases the old name in the same
transaction.

## CommunityRegistry

A community is a **public label**; the contract cannot delete posts, ban accounts,
or transfer names.

```solidity
function create(bytes32 name, string metadataURI) external;
function join(bytes32 name) external;
function leave(bytes32 name) external;
function setMetadata(bytes32 name, string metadataURI) external; // creator only
function isValidName(bytes32 name) public pure returns (bool);
```

Events: `Created`, `Joined`, `Left`, `MetadataUpdated`. `join`/`leave` are idempotent;
creating a community does not automatically join it. See [Communities](/guide/communities).

## AlgorithmRegistry

The algorithm list and default slots.

```solidity
uint8 public constant SLOT_FEED = 0;
uint8 public constant SLOT_EXPLORE = 1;

function register(IFeedAlgorithm algo) external returns (uint256 id);
function algorithmAt(uint256 id) external view returns (address);
function algorithmCount() external view returns (uint256);
function setMyAlgorithm(uint8 slot, uint256 algorithmId) external;
function algorithmOf(address user, uint8 slot) external view returns (address);
```

Events: `AlgorithmRegistered`, `AlgorithmSelected`. `register` requires no permission.
See [Algorithms](/algorithms/).
