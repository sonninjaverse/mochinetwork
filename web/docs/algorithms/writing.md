# Writing your own algorithm

Feed order comes from a contract, and choosing which contract is your right.
Deploy your own, paste the address into the feed selector, done. No one needs to
approve it.

## Interface

Exactly four functions:

```solidity
interface IFeedAlgorithm {
    function rank(address viewer, uint256[] calldata candidateIds)
        external view
        returns (uint256[] memory orderedIds, uint256[] memory scores);

    function name() external view returns (string memory);
    function description() external view returns (string memory);
}
```

Remember the four rules in [Algorithm overview](/algorithms/). Most important:
**never revert**, and **two arrays of equal length**.

## What to read

`PostRegistry` exposes all public state:

```solidity
struct Post {
    address author;
    uint48  createdAt;        // unix seconds
    uint48  parentId;         // 0 if a post, otherwise the post being replied to
    uint32  likeCount;        // raw
    uint32  weightedLikes;    // filtered by voter weight
    uint32  dislikeCount;     // raw
    uint32  weightedDislikes; // filtered the same way
    uint32  repostCount;      // reserved
    uint32  replyCount;
    bytes32 community;        // zero for a post with no community
}

function postsOf(uint256[] calldata ids) external view returns (Post[] memory);
function postOf(uint256 id) external view returns (Post memory);
function weightOf(address account) external view returns (uint32); // 0–200
function karmaOf(address account) external view returns (int256);  // signed
```

- Use **`postsOf`** for the whole candidate set. Calling `postOf` in a loop turns
  one `eth_call` into hundreds of storage reads — the most common reason an
  algorithm blows past the 4-second mark.
- `weightedLikes` / `weightedDislikes` are **already weight-filtered**. You don't
  multiply again.

::: warning The bug the weight mechanism exists to block
Scoring on `likeCount` (raw) instead of `weightedLikes`. A ring can inflate the raw
number to 99 with 100 wallets, but its weighted version is still 0.
:::

`weightOf` returns **0–200**, with 100 being one full vote. If you apply a Reddit
formula (log10, Wilson), divide `weightedLikes / 100` first to normalize to whole
votes.

## Complete example

`contracts/src/examples/NetVotesFeed.sol` is a complete algorithm in one file,
**importing nothing from the repo** — paste it into Remix or an empty Foundry
project and it compiles. It ranks by `weightedLikes − weightedDislikes`, without
time decay: a view the other four algorithms don't have.

The core snippet:

```solidity
IPostRegistry.Post[] memory ps = posts.postsOf(candidateIds);

for (uint256 i; i < candidateIds.length; ++i) {
    orderedIds[i] = candidateIds[i];

    uint256 up = ps[i].weightedLikes;
    uint256 down = ps[i].weightedDislikes;

    // Unsigned, so posts below 0 clamp at 0 instead of overflowing to a huge number.
    // Nonexistent ids also land here and get a score of 0.
    scores[i] = up > down ? up - down : 0;
}
```

## Deploy

```bash
forge create src/examples/NetVotesFeed.sol:NetVotesFeed \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key "$PRIVATE_KEY" \
  --broadcast \
  --constructor-args 0x894a39b3Fc34106c0B4724aab8cbB459b8184D46
```

`forge create` sometimes prints `Error: contract was not deployed` even though the
contract **did** deploy — the public RPC returns the receipt late and forge gives
up. Check the nonce before trusting it:

```bash
cast nonce   $YOUR_ADDRESS --rpc-url https://testnet-rpc.monad.xyz
cast compute-address $YOUR_ADDRESS --nonce $((NONCE - 1))
cast code    $THAT_ADDRESS --rpc-url https://testnet-rpc.monad.xyz | wc -c
```

## Point the feed at it

**Temporary:** open the feed selector, paste the algorithm address. Client-side
only, lost when the session ends.

**Permanent:** register it, then set it as the default for your account.

```bash
REGISTRY=0xFA1Db0d75b316579099eAf0A986690B68f9e8b21
RPC=https://testnet-rpc.monad.xyz

cast send $REGISTRY "register(address)" $YOUR_ALGORITHM \
  --rpc-url $RPC --private-key "$PRIVATE_KEY"

# SLOT_FEED = 0, SLOT_EXPLORE = 1
cast send $REGISTRY "setMyAlgorithm(uint8,uint256)" 0 $ID \
  --rpc-url $RPC --private-key "$PRIVATE_KEY"
```

`register` **requires no permission** and there is **no admin function**: no one,
not even the team, can remove your algorithm or stop others from choosing it.

## Test before trusting

Try ranking on a real candidate set — the exact call the client makes:

```bash
IDS=$(curl -s 'http://localhost:8787/candidates?strategy=recent&limit=500' \
  | python3 -c 'import sys,json; print(",".join(json.load(sys.stdin)["ids"]))')

cast call $YOUR_ALGORITHM \
  "rank(address,uint256[])(uint256[],uint256[])" \
  0x0000000000000000000000000000000000000000 "[$IDS]" \
  --rpc-url https://testnet-rpc.monad.xyz
```

If the call returns, the feed will render. If it reverts or times out, the page
shows the unranked list and **gives no reason** — that is precisely why "never
revert" is a rule.
