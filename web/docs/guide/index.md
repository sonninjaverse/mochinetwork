# What Mochi is

Mochi Network is a Reddit-style social network running on Monad testnet: it has
communities (`m/monad`), posts, replies, and votes. The difference is that
**reputation and feed order are decided on-chain**, not by a hidden server.

## Three pieces

| Piece | Where | What it does |
|---|---|---|
| **Contract** | Monad testnet | Holds posts, votes, karma, and every ranking algorithm |
| **Indexer** | Node.js + SQLite | Indexes logs for fast reads; chooses *which posts* are considered, not the ranking |
| **Web** | Next.js | Browser client: reads the chain and indexer, signs transactions with a passkey |

The key point: the indexer only answers **which posts are considered**, while the
**order** is an `eth_call` to the contract. The indexer does not score posts, but its candidate selection can influence
which posts appear.

## What you'll see

- **Home** (`/`) — posts from communities you've joined.
- **Popular** (`/popular`) — every post in some community, ordered by algorithm.
- **Communities** (`/m/`) — community list, where you create a new community.
- **Community** (`/m/monad`) — its own feed, with a post button.
- **Profile** (`/alice` or `/0x…`) — karma, vote weight, posts, and replies.

## Read on

1. [Enter the app and create a wallet](/guide/getting-started) — gate, passkey, wallet address.
2. [Karma and weight](/guide/karma) — **the most important part**, explains why
   14 votes can become −602 karma.
3. [Voting](/guide/voting) — like, dislike, withdraw a vote, why you can't vote on yourself.
4. [Posts and replies](/guide/posts).
5. [Communities](/guide/communities).
6. [How the feed works](/guide/feed).

## One line to remember

> **Raw vote count is the number of people. Karma is the number of people times each person's reputation.**

That's the whole reason the two numbers side by side look contradictory.
