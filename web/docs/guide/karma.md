# Karma and weight

This page explains the most confusing thing: **why a post with 14 votes has
karma as low as −602**.

::: tip One line
Raw vote count counts **people**. Karma adds up **each person's weight**. A
person's weight depends on that person's own karma.
:::

## Two numbers differ in two places

In the interface, these two numbers appear side by side and are not in the same unit:

| Where shown | Number | Meaning |
|---|---|---|
| Next to the vote button on a card | **raw** net `likeCount − dislikeCount` | How many more **people** |
| Next to the author name | `authorKarma` | **Weighted** total across the **whole account** |
| Karma box on the profile | `karmaOf` read directly from the chain | Same number as `authorKarma` |

So "14 downvotes" (raw) and "−602 karma" (weighted) can describe the same thing,
just in different units.

## Unit: 100 points = one full vote

Solidity has no decimals, but the system needs to express both "0.05 vote" and
"1.25 votes". So it picks a small unit:

> **100 karma points = 1 full vote.** Like 1 dollar = 100 cents.

`weight` is how many "cents" a vote is worth. `karma` is the total "cents" an
account has received. Every ranking algorithm divides `weightedLikes / 100`
before applying the Reddit formula, because the Reddit formula counts in **whole
votes**.

## Where weight comes from

A person's weight derives directly from that person's own karma, by rung:

| Karma | Weight | Meaning |
|---:|---:|---|
| < 0 | **0** | Muted — the vote has no value |
| 0 | **1** | New wallet: 0.01 vote |
| 1 … 9 | **5** | 0.05 vote |
| 10 … 49 | **25** | 0.25 vote |
| 50 … 199 | **100** | Exactly one vote |
| 200 … 999 | **125** | 1.25 votes |
| 1000 … 4999 | **150** | 1.5 votes |
| ≥ 5000 | **200** | Cap: 2 votes |

The same table, in the contract:

```solidity
function weightOf(address account) public view returns (uint32) {
    int256 k = karmaOf[account];
    if (k >= 5000) return 200;
    if (k >= 1000) return 150;
    if (k >= 200)  return 125;
    if (k >= 50)   return 100;
    if (k >= 10)   return 25;
    if (k >= 1)    return 5;
    if (k >= 0)    return 1;
    return 0;
}
```

## Example 1 — an account climbing rungs

1. **New wallet** A has `karmaOf(A) = 0` → `weightOf(A) = 1`. A's vote is worth 0.01.
2. B (also new, weight 1) likes A's post. Since B ≠ A it's valid.
   - `karmaOf(A)` : 0 → **1**
   - `weightOf(A)` : 1 → **5** (since 1 karma falls in rung `1…9`)
3. A gets 50 different accounts upvoting → `karmaOf(A) = 50` →
   `weightOf(A) = 100`. From now on one like from A is worth **a full vote**.
4. A reaches 5000 karma → `weightOf(A) = 200` (cap 2 votes).
5. A is downvoted into negative → `weightOf(A) = 0`. A's vote **has no value**
   until upvoted back above 0.

## Example 2 — why 14 people but −602

A worked example. One account has two heavily disliked posts:

| Post | Raw likes | Raw dislikes | **Raw** net | `weightedLikes` | `weightedDislikes` | **Weighted** net |
|---|---:|---:|---:|---:|---:|---:|
| 18 | 1 | 9 | **−8** | 5 | 466 | **−461** |
| 16 | 1 | 7 | **−6** | 1 | 142 | **−141** |
| **Total** | 2 | 16 | **−14** | 6 | 608 | **−602** |

Reading the table:

- The cards show `−8` and `−6` — that's the **number of people ahead**. Raw total is **−14**.
- But the 9 people who disliked post 18 aren't all "worth 1". They already have
  karma, so 466 points across 9 votes ≈ **52 points/person**. Post 16: 142 / 7 ≈ 20 points/person.
- The only two likes are worth just **5** and **1**, because those likers have very low karma.
- Karma is the **whole-account total**, not per post:
  `6 − 608 = −602`.

So: `14` and `−602` don't contradict. One counts people, the other sums reputation.

::: warning Don't compare `raw net` with `karma`
If you want a number that matches karma, add `weightedLikes − weightedDislikes`.
The raw net is just a headcount.
:::

## Why negative karma is muted

The floor rung used to be 1: anyone heavily downvoted still kept a small voice.
Now negative karma returns **0**. The reasons:

- An account downvoted by the whole room shouldn't still be able to "save" itself
  by voting on others.
- It's **not permanently locked**: others can still upvote it, and once karma
  rises above 0 the weight recovers immediately.
- Karma of exactly 0 still gets weight 1, so a brand-new wallet isn't silenced.

## Why this design resists clones

If a new wallet were worth 1 whole vote, then **2 clone wallets = 1 normal
person**. Here a new wallet is worth 0.01 votes:

- A ring needs **~100 wallets** to match one normal vote.
- To get one member to weight 100, the ring must upvote it cross-wise up to 50
  karma — i.e. ~50 more wallets just to raise one person.

Not an absolute lock, but it raises the price by two orders of magnitude. In
exchange, the system stays fair: anyone can vote from day one.

## Read directly on chain

Karma and weight don't require trusting the indexer. Check with `cast`:

```bash
POST_REGISTRY=0x894a39b3Fc34106c0B4724aab8cbB459b8184D46

cast call $POST_REGISTRY "karmaOf(address)(int256)" 0xYourAddress \
  --rpc-url https://testnet-rpc.monad.xyz

cast call $POST_REGISTRY "weightOf(address)(uint32)" 0xYourAddress \
  --rpc-url https://testnet-rpc.monad.xyz
```
