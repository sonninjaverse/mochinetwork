# Write your own feed algorithm

Mochi's feed order comes from a contract. Which contract is your choice, and
nothing about that choice needs our permission: deploy yours, paste its address
into the feed control, and the feed reorders. This page is how.

Everything below has been run. The example is deployed at
`0x8ffDad83C6c3e6bbf50088D46DaC87C9B8547601` on Monad testnet, and you can point
the feed at it right now to see what a third-party algorithm looks like from the
inside of the product.

## The whole interface

```solidity
function rank(address viewer, uint256[] calldata candidateIds)
    external view
    returns (uint256[] memory orderedIds, uint256[] memory scores);

function name() external view returns (string memory);
function description() external view returns (string memory);
```

The client sends a candidate set and a viewer. You send back the same ids in
your order, with a score each. That is the entire contract between us.

Ranking is an `eth_call`. It costs the reader nothing, needs no wallet, and is
not a transaction — which is why switching algorithms in the UI is instant and
free, and why a signed-out visitor still gets a ranked feed.

## Four rules

1. **`rank` is `view`.** Clients call it with `eth_call`.
2. **`rank` must never revert, on any input.** A revert reaches the reader as a
   blank feed with nothing to explain it. Unknown ids, an empty array, the zero
   address: all normal, all must return.
3. **Return two arrays of the same length.** `scores[i]` belongs to
   `orderedIds[i]`. The client reads them by index.
4. **Answer within about 4 seconds.** The client gives up after
   `RANK_TIMEOUT_MS` and falls back to unranked order, because an algorithm
   deployed by a stranger must not be able to hang the page.

Rule 2 is the one that bites. Test it before you deploy:

```solidity
feed.rank(address(0), new uint256[](0));   // empty
uint256[] memory unknown = new uint256[](1);
unknown[0] = type(uint256).max;            // an id that does not exist
feed.rank(address(0), unknown);
```

## What you can read

One contract holds everything the shipped algorithms use. It is plain public
state — nothing is hidden from you that is available to us.

**`PostRegistry`** — [`0x894a39b3Fc34106c0B4724aab8cbB459b8184D46`](https://testnet.monadscan.com/address/0x894a39b3Fc34106c0B4724aab8cbB459b8184D46)

```solidity
struct Post {
    address author;
    uint48 createdAt;        // unix seconds
    uint48 parentId;         // 0 for a post, else the post it replies to
    uint32 likeCount;        // raw
    uint32 weightedLikes;    // filtered by the voters' weight
    uint32 dislikeCount;     // raw
    uint32 weightedDislikes; // filtered the same way
    uint32 repostCount;      // reserved
    uint32 replyCount;
    bytes32 community;       // zero for a post with no community
}

function postsOf(uint256[] calldata ids) external view returns (Post[] memory);
function postOf(uint256 id) external view returns (Post memory);
```

Use `postsOf` for the candidate set. Calling `postOf` in a loop turns one
`eth_call` into hundreds of separate storage reads and is the usual reason an
algorithm trips the 4-second budget.

**Karma and weight**, on the same contract:

```solidity
function weightOf(address account) external view returns (uint32); // 0-200, 100 = one vote
function karmaOf(address account) external view returns (int256);  // signed, 100 = one vote
```

`weightOf` is how this network resists sybils. A vote is worth the voter's own
karma, so an account the room has downvoted carries a fraction of a fresh one's
weight and burying someone costs influence. `weightedLikes` and
`weightedDislikes` are already filtered by it — you never apply it yourself.

**Scoring on `likeCount` instead of `weightedLikes` is the mistake the weighting
exists to prevent.** A ring can move the raw counter freely; only the weighted
one it cannot, because each of its votes is worth whatever its karma made it
worth.

### Replies

`parentId` is 0 for a top-level post and otherwise the post being answered.
The client's candidate sources already drop replies before they reach you, so
an algorithm does not have to filter them — but a client that does not is
entitled to send them, and scoring them as though they were posts is the
mistake to avoid.

## A complete example

[`src/examples/NetVotesFeed.sol`](../src/examples/NetVotesFeed.sol)
is a working algorithm in one file, with no imports from this repository — paste
it into Remix or an empty Foundry project and it compiles. It ranks by weighted
likes minus weighted dislikes, with no time decay, which is an opinion none of
the shipped algorithms hold: a good post from last week outranks a fresh one
nobody liked.

The part that matters:

```solidity
IPostRegistry.Post[] memory ps = posts.postsOf(candidateIds);

for (uint256 i; i < candidateIds.length; ++i) {
    orderedIds[i] = candidateIds[i];

    uint256 up = ps[i].weightedLikes;
    uint256 down = ps[i].weightedDislikes;

    // Unsigned, so a post underwater floors at zero rather than wrapping
    // to an enormous number. An unknown id lands here too and scores 0.
    scores[i] = up > down ? up - down : 0;
}

_sortDesc(orderedIds, scores);
```

Its tests are in [`test/NetVotesFeed.t.sol`](../test/NetVotesFeed.t.sol),
including the never-reverts case and a fuzz test that the two arrays stay the
same length and the scores come back sorted.

## Deploy it

```bash
forge create src/examples/NetVotesFeed.sol:NetVotesFeed \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key "$PRIVATE_KEY" \
  --broadcast \
  --constructor-args 0x894a39b3Fc34106c0B4724aab8cbB459b8184D46
```

**`forge create` may print `Error: contract was not deployed` when the contract
did in fact deploy.** The public RPC is slow to serve receipts and forge gives up
waiting. Check the nonce before believing it — if it went up, you have a
contract:

```bash
cast nonce   $YOUR_ADDRESS --rpc-url https://testnet-rpc.monad.xyz
cast compute-address $YOUR_ADDRESS --nonce $((NONCE - 1))
cast code    $THAT_ADDRESS --rpc-url https://testnet-rpc.monad.xyz | wc -c
```

Three of these landed while writing this page, all reported as failures.

## Point the feed at it

Open the feed control, expand **Use someone else's algorithm**, paste the
address. That is a client-side override: it changes nothing on chain and lasts
for the session.

To make it stick, register it once and set it as your default:

```bash
# AlgorithmRegistry 0xFA1Db0d75b316579099eAf0A986690B68f9e8b21
cast send $REGISTRY "register(address)" $YOUR_ALGORITHM \
  --rpc-url https://testnet-rpc.monad.xyz --private-key "$PRIVATE_KEY"

# slot 0 = feed, slot 1 = explore
cast send $REGISTRY "setMyAlgorithm(uint8,uint256)" 0 $ID \
  --rpc-url https://testnet-rpc.monad.xyz --private-key "$PRIVATE_KEY"
```

`register` is permissionless and has no admin function: nobody, including us,
can remove your algorithm or stop anyone choosing it. `setMyAlgorithm` sets it
for your account only.

## Check it against real posts first

Rank the live candidate set before you rely on it. This is the same call the
client makes:

```bash
IDS=$(curl -s 'http://localhost:8787/candidates?strategy=recent&limit=500' \
  | python3 -c 'import sys,json; print(",".join(json.load(sys.stdin)["ids"]))')

cast call $YOUR_ALGORITHM \
  "rank(address,uint256[])(uint256[],uint256[])" \
  0x0000000000000000000000000000000000000000 "[$IDS]" \
  --rpc-url https://testnet-rpc.monad.xyz
```

If that returns, the feed will render. If it reverts or times out, the page
shows an unranked list and you will not be told why — which is exactly why rule
2 is a rule.

## Addresses

| Contract | Address |
|---|---|
| PostRegistry | `0x894a39b3Fc34106c0B4724aab8cbB459b8184D46` |
| AlgorithmRegistry | `0xFA1Db0d75b316579099eAf0A986690B68f9e8b21` |

Chain id 10143, RPC `https://testnet-rpc.monad.xyz`, explorer
[testnet.monadscan.com](https://testnet.monadscan.com).
