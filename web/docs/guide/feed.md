# How the feed works

There are **two** decisions, and they're deliberately separate:

| Decision | Who makes it | Where |
|---|---|---|
| **Which posts** are considered | Indexer | Off-chain, by the tab you have open |
| **The order** | Algorithm contract | On-chain, via `eth_call` |

The indexer **does no ranking** and has no secret weights. The contract **doesn't
know** which posts to consider — the client hands it a candidate set.

## Choosing candidates (indexer)

The tab you have open decides the candidate-fetching strategy:

| Strategy | Fetches | Used in |
|---|---|---|
| `recent` | Newest | Global New/Chrono |
| `popular` | Every post in some community | **Popular** |
| `trending` | Gaining speed | Auxiliary Popular |
| `community` | Within one community | `/m/<name>` |
| `joined` | From communities you've joined | **Home** |

Replies (`parentId != 0`) are **always excluded** from every candidate source, so
they never touch the algorithm.

## Ranking (contract)

The client calls `rank(viewer, candidateIds)` on an algorithm contract. Because
it's an `eth_call`:

- **Free** and **instant** — not a transaction.
- **No wallet needed** — a logged-out guest still gets a ranked feed.
- Has a **~4 second timeout**; if the algorithm hangs or reverts, the client
  falls back to unranked order and doesn't break the page.

See [Algorithms](/algorithms/) for the four algorithms included.

## Algorithm picker

The feed has a button that opens a picker:

- Choose one of four built-in sorts (**Hot**, **New**, **Best**,
  **Controversial**).
- Paste **any algorithm address** — including an algorithm you deployed yourself.
  This is a client-side choice, it changes nothing on chain.
- **Set as default** for your account (`setMyAlgorithm`).
- View the **contract source** of the selected algorithm.

Registering an algorithm in the registry is **permissionless**: no one, not even
the team, can remove it or stop others from using it.

::: tip No personalization
The feed doesn't learn your preferences. The same candidate set and the same
algorithm produce the same result for everyone, unless the algorithm *itself*
uses the `viewer` parameter.
:::
