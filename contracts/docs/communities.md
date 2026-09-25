# Communities and karma

A community is a name held by `CommunityRegistry`, which records who registered
it and who has joined. `CommunityRegistry` cannot delete posts, ban accounts,
transfer names or upgrade the protocol.

## Membership is enforced on chain

`PostRegistry` holds an immutable `CommunityRegistry`, and
`postToCommunity(bytes32 community, string text, string mediaURI)` reverts
`NotAMember` unless the author has joined. A post carries its community as a
`bytes32` **field** — the text is only text — which is what lets the contract
check membership at all. The tag used to live in the text, where the contract
could not see it, so joining could be ignored just by writing the text directly.

A reply inherits its parent's community and is **not** gated: commenting, as
anywhere, does not require joining first.

Feeds still work the same way underneath — every algorithm accepts
`rank(viewer, candidateIds)`, and the indexer picks the candidates and filters
them by community. It reads the community from the post's event rather than
recovering it from text.

## Names

Names contain 3–21 lowercase ASCII letters, digits or underscores and are
right-padded to `bytes32`. The registry checks this on chain so there is exactly
one spelling of a name. Interior zero bytes are invalid.

Join and leave are idempotent. Creating a community does not automatically join
it. Member counts and post counts are derived by the indexer.

## Describing a community

Only the creator may call `setMetadata`. This is control over the description
of their registered name, not over anyone else's content or protocol settings.
Metadata is emitted in events rather than stored. The web client accepts JSON
with `description` and `icon` fields, including an inline JSON data URI.

## Karma

Karma is on chain, kept by `PostRegistry`. `karmaOf(account)` is the signed
sum of the weights of the votes its posts have received — 100 points to a
whole vote. A like adds the voter's `weightOf`; a dislike subtracts it; a
withdrawal reverses exactly what it added, because each vote remembers the
weight it carried. Votes on your own post are refused, so karma cannot be
farmed.

`weightOf` turns karma back into the weight of your next vote: **1 for a fresh
account**, 5 at 1 karma, 25 at 10, a whole vote (100) at 50, and up to 200 at
5,000. That is the only place vote weight comes from. Starting at one per cent
is the sybil defence: every account may vote, but a ring needs a hundred
wallets for the influence one trusted account has.

The indexer mirrors this number for feed badges, summing the same weights from
the `Liked` and `Disliked` events, but the client reads the profile total from
the contract. There is no separate reputation service.

## Adding the registry to an existing deployment

Use `script/DeployCommunity.s.sol`, not the full deployment script. The latter
creates a fresh network. The standalone script deploys only the new registry.
The equivalent Node command records the receipt and verifies runtime bytecode:

```bash
cd indexer
node --env-file=../contracts/.env --import tsx scripts/deploy-community.ts
# Add --broadcast to submit the deployment after inspecting the estimate.
```

Set `COMMUNITY_REGISTRY` and `COMMUNITY_DEPLOY_BLOCK` on the indexer and
`NEXT_PUBLIC_COMMUNITY_REGISTRY` for the web build. The indexer adds columns in
place and retrieves the new registry's logs from its deployment block, without
resetting the existing post cursor. A post carries its community in the
`PostCreated` event, so there is nothing to reconstruct: already-cached posts
keep an empty community. Keep the existing SQLite database.

The Next.js app serves community routes directly; rebuild it after updating the
public contract addresses.

## Local browser verification

```bash
cd web
pnpm test:e2e
```

This starts a disposable Anvil node, deploys real contracts, ingests real logs
into an in-memory SQLite database, and tests the production app on desktop and
mobile Chromium. It checks creation, joining, posting, Subs, leaving, reloads,
sorting and karma across profiles, cards and replies. No public-chain writes
are made. The local signing fixture uses the existing burner adapter; production
passkey enrollment remains covered by the separate opt-in browser test.
