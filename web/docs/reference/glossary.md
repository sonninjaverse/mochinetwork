# Glossary

**Karma** — The signed sum of the weights that an account's posts and comments have
received. Stored on-chain in `PostRegistry.karmaOf`. Unit: points, 100 points = 1
vote.

**Weight** — How much a vote is worth, derived from the karma of the **voter**. 0–200;
100 is a full vote. Function `weightOf`.

**Point** — The smallest unit. 100 points = 1 vote. Solidity has no decimals, so the
system uses points to be able to say "0.01 votes".

**Vote** — A single like or dislike, carrying the weight of the person casting it.

**Raw count** — `likeCount` / `dislikeCount`: counts **people**, one each, ignoring
reputation. For display only.

**Weighted count** — `weightedLikes` / `weightedDislikes`: the sum of weights. This
is what algorithms and karma use.

**Candidate** — The set of post ids the indexer hands to the ranking contract. The
selection of this set happens off-chain.

**Strategy** — How the indexer selects candidates: `recent`, `popular`, `trending`,
`community`, `joined`.

**Slot** — A "compartment" in `AlgorithmRegistry` holding one algorithm. `SLOT_FEED`
= 0 (main feed), `SLOT_EXPLORE` = 1.

**Algorithm** — A contract implementing `IFeedAlgorithm`, taking `(viewer,
candidateIds)` and returning an order with scores.

**Epoch** — The time anchor Hot uses as the base for a post's age term. Equal to the
deploy time of HotFeed.

**Wilson** — The confidence-interval formula in the Best algorithm. Uses
`z = 1.2815…` (80% confidence), the same as Reddit.

**Balance / Magnitude** — Two quantities of Controversial: `balance` is how evenly
likes and dislikes are split, `magnitude` is the total number of votes.

**Handle** — Display name: `bytes32`, 3–15 characters `a–z0–9_`, held by
`IdentityRegistry`. Can be changed, and the old name is released.

**Passkey** — A WebAuthn key on the device. This is the account; there is no password.

**Gate** — The testnet access-limiting mechanism: an invite code sets a signed
cookie; the edge function and API verify it with a shared secret.

**Indexer** — The off-chain service that reads logs into SQLite, returns post content,
and selects candidates. It is a cache, not the source of truth.

**Reply** — A post with a non-zero `parentId`. Only the direct parent is stored;
comments are never ranked.

**IPFS / CID** — The chain stores only `ipfs://<cid>`, not a URL. A gateway showing
images is the client's decision.
