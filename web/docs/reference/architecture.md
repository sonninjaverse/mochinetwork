# System architecture

Mochi has a Next.js social app, Solidity contracts on Monad, a SQLite indexer,
and a separate VitePress handbook.

| Part | Role |
| --- | --- |
| Contracts | Posts, votes, karma, identities, communities, and ranking algorithms |
| Indexer | Reads chain logs, selects candidate posts, and returns content |
| Social app | Passkey signing, direct contract reads, and the feed interface |
| Handbook | Static documentation for users and developers |

```text
Social app ── candidate ids and content ──► Indexer + SQLite
    │                                          │
    ├── rank via eth_call ──► Monad ◄── read event logs
    └── signed posts/votes ──► Monad

VitePress handbook: separately built static documentation
```

The browser signs transactions using the reader's passkey. The indexer has no
user signing keys. It can influence the candidate set; the chosen contract
computes scores and the ordering of those candidates.

## Contracts — source of truth

Eight deployed contracts. Full addresses in [Contracts and addresses](/reference/contracts).

- `PostRegistry` holds posts, votes, and **karma** (`karmaOf`, `weightOf`).
- `ChronoFeed`, `HotFeed`, `BestFeed`, `ControversialFeed` are the four ranking algorithms.
- `AlgorithmRegistry` maps feed slots to algorithms. The default slot is `HotFeed`.
- `IdentityRegistry` holds handles. `CommunityRegistry` holds community names and membership.

No contract has a governance function. **There is no follow graph**: vote weight is
derived directly from the voter's own karma, not from who they follow.

## Indexer — cache, not ranking

The indexer reads Monad logs into SQLite, runs one backfill, then tails over WebSocket.

It does two things:

1. **Select candidates.** `/candidates` returns the list of post ids an algorithm
   should consider, according to one of five strategies (`recent`, `popular`,
   `trending`, `community`, `joined`). This is the indexer's **only** influence on
   the feed, and it is deliberately naive and public: no secret weights, no
   personalization.
2. **Return content.** `/posts`, `/profile`, `/communities`, `/thread`… return text,
   images, raw counts, and notifications.

Scoring happens on-chain: the web gets ids from the indexer and performs an
`eth_call` to `rank(viewer, ids)` on the contract. The indexer does not compute scores, but its choice of candidates can affect
which posts appear. See [Indexer API](/reference/indexer-api).

## Web — Next.js app

The social app runs as a Next.js Node.js server. Middleware sets a nonce-based
Content Security Policy and, when configured, checks an optional invite cookie.
The browser derives and uses the wallet; the server never receives its key.

- Contract reads and wallet writes share one chain configuration.
- The indexer supplies post content and candidate sets.
- The VitePress handbook is a separate static build in `web/docs`.
- App, API, and docs URLs are configured for each deployment.

See [Running and deploying Mochi](/reference/deploy).

## On-chain and off-chain

| Data | Where | Notes |
|---|---|---|
| Posts, comments, `parentId`, community label | Chain (`PostRegistry`) | Written as events, immutable |
| Like/dislike votes and each vote's weight | Chain | `like`/`dislike` write both karma and weighted counters |
| `karmaOf`, `weightOf` | Chain (`PostRegistry`) | No intermediary reputation service |
| Ranking score | Chain (`rank`) | Web calls directly, free |
| Handle | Chain (`IdentityRegistry`) | |
| Community registration, join/leave | Chain (`CommunityRegistry`) | |
| Selected feed slot | Chain (`AlgorithmRegistry`) | |
| Post index by author / community / thread | Indexer | Derived from logs, rebuildable |
| Candidate list | Indexer | Only selects posts, does not score |
| Raw counts `likeCount` / `dislikeCount` | Indexer | For display |
| Profiles, notifications, search | Indexer | These are views of the chain |
| Gate cookie, indexer tables, image CIDs | Indexer / IPFS | Auxiliary state; the Pinata key stays on the indexer |

Karma is also cached by the indexer as `postKarma`/`commentKarma` to draw profiles,
but the official number remains `PostRegistry.karmaOf`, read directly from the chain.

## Why deleting the indexer is safe

Because the indexer is only a **cache of facts already on-chain**. Delete
`mochi.db` and restart, and it rebuilds from `DEPLOY_BLOCK`:

- No posts, votes, or karma lost — all of it remains in Monad's logs.
- No ranking lost — ranking was never in the indexer.
- No accounts lost — addresses and handles come from the contracts.

Candidate selection still affects what readers see. Rebuilding is **not free**: Monad produces roughly 288,000 blocks
per day, and the public endpoint rejects `eth_getLogs` for more than 100 blocks.
A dedicated RPC is therefore required, and `mochi.db` is kept across deploys.

::: warning Rebuilding is not a routine operation
Every hour that passes raises the backfill cost. Keep `mochi.db` alive across
restarts; only rebuild when truly necessary.
:::

## Private gate

A deployment can be held behind a shared access code until it is ready to go
public. The mechanism has only **one secret**, `GATE_SECRET`, set in two places:

- **Web** — a server environment variable read by Next.js middleware.
- **API** — a server environment variable on the indexer.

The flow:

1. A user submits a code at `/gate/`. This page does `POST /gate` to the API.
2. The API checks the code against `GATE_CODES`, then sets an apex-scoped
   `mochi_gate` cookie.
3. The cookie has the form `expiry.HMAC-SHA256(secret, expiry)`. No DB, no session.
4. **Both web and API** verify the signature with that same secret before responding.

Web middleware checks before serving any route; the API checks before answering any route
**except `/health` and `/gate*`**. `/health` is open because monitoring needs it to answer before anyone has a code, and it only reports liveness
plus a few numbers.

Rotating the secret in both services and restarting them revokes every old cookie at once. The
gate hides the **application**, not the data: posts and votes are on-chain events,
still public whether the gate is on or not.

::: tip One secret, two ends
Because the web and API share exactly one secret and verify independently, there is
no session store to break, to expire inconsistently, or to attack.
:::
