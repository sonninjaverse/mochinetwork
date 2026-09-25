# How the feed works

Two things decide what you see, and they are separate on purpose.

**Which posts are considered** comes from an indexer we run. It is off chain,
it is dumb by design, and it is decided by the page you are on — not by a
setting. There is no secret weighting in it and no personalisation.

**What order they appear in** comes from a contract. Ranking is an `eth_call`,
so switching is instant, costs nothing, and needs no wallet — a signed-out
visitor gets a ranked feed. Which contract is your choice, and it can be one we
never wrote: see [writing your own](writing-an-algorithm.md).

## The pages, and what they consider

| Page | Posts considered |
|---|---|
| Home | posts from the communities you have joined |
| Popular | every post that belongs to a community |
| A community | that community's posts |

There is **no follow graph**. The only thing about *you* that affects the feed
is which communities you have joined, and joining is membership rather than a
social edge — see [communities](communities.md).

## The four sorts

These are Reddit's, implemented from its published `_sorts.pyx` rather than
reinvented. Every one of them scores `weightedLikes` / `weightedDislikes`,
scaled back to whole votes (`/ 100`) to match Reddit's integer formulas.

**Hot** — the default. `log10(weightedLikes / 100) + seconds / 45000`. Votes
count logarithmically, so the tenth vote matters far less than the first, and
every 12.5 hours a post needs ten times as many votes to hold its place. This is
the ranking that made Reddit's front page behave the way it does.

**New** (Chrono) — newest first. No ranking, no filtering, no opinion. The
baseline you compare the others against.

**Best** — the Wilson score lower bound at 80% confidence (`z = 1.2815…`, the
figure Reddit uses). Ranks by how sure the votes make us rather than by the
average, so nine hundred votes at 80% beats four votes at 100%. One friendly
vote does not outrank a crowd. Our implementation is checked against Reddit's
own output to within 0.5%.

**Controversial** — `magnitude ^ balance`, where balance is how evenly the
votes split. Surfaces what people disagreed about rather than what they agreed
on — the one thing an engagement-maximising feed will never show you, because
disagreement does not retain.

## Votes are weighted by karma

A like is not worth the same from everyone. A vote is worth the voter's
`PostRegistry.weightOf`, which is derived from **the voter's own karma**, held
on chain in `PostRegistry.karmaOf`:

| Karma | Weight | A vote is worth |
|---:|---:|---|
| below 0 | 0 | nothing — silenced |
| 0 | 1 | 1% of a vote |
| 1 … 9 | 5 | 5% |
| 10 … 49 | 25 | a quarter |
| 50 … 199 | 100 | one whole vote |
| 200 … 999 | 125 | 1.25 |
| 1000 … 4999 | 150 | 1.5 |
| 5000 and up | 200 | the cap, two votes |

100 points is one whole vote; 200 is the cap. A fresh account starts at one
point, not a whole vote, so a ring of new wallets needs a hundred of them to
carry the influence one trusted account carries. Karma below zero is silenced
outright: the vote is worth nothing until the room upvotes the account back
above zero. A vote on your own post is refused, so karma cannot be farmed.

The sorts above read `weightedLikes` and `weightedDislikes`, never the raw
`likeCount` and `dislikeCount`. A ring can move the raw counter freely; the
weighted one is the number it cannot move, because each vote is worth whatever
its voter's karma made it worth.

## Replies

A reply is a post with a parent, and the parent is in contract storage rather
than only in the event. That is the difference that matters: a ranking contract
has to be able to tell a reply from a post, because one that cannot would score
a fragment of an argument against posts nobody can see it answering.

Only the direct parent is stored. Threading is a reading decision, and a stored
thread root would be a second thing to keep true. A reply inherits its parent's
community.

Replies are excluded from every candidate source, so they never reach a ranking
contract at all — choosing what is considered is the indexer's one job. A
conversation is shown in the order it happened, unranked: scoring it would turn
an argument into a leaderboard.

## Images

A post can carry one image. The chain stores a content address — `ipfs://<cid>`
— and never a URL, so the gateway that renders it is a decision the client
makes and can change without touching a single post.

The address rides in the event data alongside the text and never reaches
storage, for the same reason the text does not: no ranking reads it, and a post
costs the same whatever it shows.

## Usernames

A handle is a `bytes32`, so at most 31 bytes; the contract narrows that to
3–15 characters of lowercase letters, digits and underscore. The narrow
alphabet is not tidiness — mixed case and lookalike characters are how
impersonation starts on a network where the name is all most people read.

Renaming frees the old name in the same call that takes the new one. Either
order on its own would strand a name nobody can use or let one account hold
two, and uniqueness is the only thing that contract exists to guarantee.

## What is on chain

Posts, communities and membership, likes, dislikes, karma and every ranking
contract. A post carries the community it belongs to as a field, and posting
into a community is refused unless the author has joined it.

The indexer holds no truth: wipe it and it rebuilds from the chain. It exists
because reading every post from a node to render a page would be slow, not
because it knows anything the chain does not.

Contract addresses are in [DEPLOYED.md](../DEPLOYED.md). No contract has an
admin function — including us.
