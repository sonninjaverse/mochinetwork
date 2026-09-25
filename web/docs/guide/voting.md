# Voting

Each post has two buttons: **like** and **dislike**. Both are on-chain
transactions and both are **multiplied by the voter's weight**.

## What happens when you vote

When you like someone else's post, the contract:

1. Computes `w = weightOf(msg.sender)` — **your** weight, not the author's.
2. Adds `w` to the post's `weightedLikes`.
3. Adds `w` to `karmaOf[author]`.
4. Increments `likeCount` (the raw count) by 1.
5. Stores `w` in your vote and emits `Liked(id, you, w)`.

Dislike does the same but **subtracts**.

## Withdrawing a vote returns exactly what was added

Each vote remembers its weight at the time it was cast. When you withdraw a
like, the contract subtracts exactly the stored `_likeWeight` — even if your
weight has changed since. This keeps `karma` consistent: withdrawing a vote
cannot create a discrepancy.

Clicking the currently selected button withdraws the vote. You can change your
mind between like and dislike: the contract withdraws the old one first, then
records the new one.

## You can't vote on yourself

Voting on your own post is **rejected** (`CannotVoteSelf`). This is why karma
can't be self-farmed by liking your own posts.

## Two counters, two purposes

Each post keeps **two** pairs of numbers:

| Field | Meaning |
|---|---|
| `likeCount` / `dislikeCount` | Raw headcount — used for display |
| `weightedLikes` / `weightedDislikes` | Weighted totals — used for ranking and karma |

The ranking algorithm **only reads the weighted version**. A ring can inflate
`likeCount` to 99 with 100 wallets, but its `weightedLikes` stays 0, because each
wallet has weight 1.

::: warning Don't rank by raw counts
Using `likeCount` instead of `weightedLikes` is exactly the bug the weight
mechanism exists to block.
:::

## Newcomer votes

A new wallet has weight 1, so its vote is worth **0.01** of a full vote. Anyone
can vote immediately, but a stranger's vote barely changes the ranking. See
[Karma and weight](/guide/karma).

## On chain

```solidity
function like(uint256 id) external;
function dislike(uint256 id) external;
function unlike(uint256 id) external;
function undislike(uint256 id) external;
```

A vote's state for an account is read from `hasLiked(id, account)` and
`hasDisliked(id, account)`.
