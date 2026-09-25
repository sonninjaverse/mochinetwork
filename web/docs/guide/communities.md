# Communities

A community is a name held by `CommunityRegistry`, which records who registered
it and who has joined. It **cannot** delete posts, ban accounts, transfer names,
or upgrade the protocol.

## You must join to post

A post carries its community as a `bytes32` **field** — the text is only text —
and `PostRegistry` holds an immutable reference to `CommunityRegistry`:
`postToCommunity` reverts `NotAMember` unless you have joined. That check is on
chain, not only in the app, which is the point: the tag used to live in the
text, where the contract could not see it, so joining could be ignored.

A **reply** inherits its parent's community and is not gated, so commenting does
not require joining first.

## Names

A name is **3–21 characters** of lowercase ASCII letters, digits or `_`,
right-padded to fill `bytes32`. The contract validates it on chain so there is
exactly one spelling of a name.

## Register, join, leave

- **Creating** a community does **not** automatically join it.
- **Join** and **leave** are both **idempotent** — calling again doesn't error or
  double up.
- Member counts and post counts are derived by the indexer, not stored in the contract.
- Only the creator can call `setMetadata` to describe the community. That's
  authority over *the description of their name*, not over other people's
  content. Metadata is emitted in an event; the client receives JSON with
  `description` and `icon` (including data URIs).

## In the app

| Path | Page |
|---|---|
| `/m/` | **Your communities** and **Explore**, with search and a create button |
| `/m/<name>` | Community feed, post button |

The directory is two tabs on one page: the ones you have joined, and the ones
you have not. A community leaves Explore once you join it, so the two never
repeat each other. Explore leads, because a new account's list is empty by
definition.

**Home** collects posts from communities you've joined. With nothing joined, Home
is empty — that's why Popular exists.
