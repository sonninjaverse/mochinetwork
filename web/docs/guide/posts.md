# Posts and replies

## Posting

A post is a transaction calling `postToCommunity(community, text, mediaUri)`.
The community is a `bytes32` **field**, and the contract refuses the post unless
you have **joined** that community. `mediaUri` is a **content address** (usually
`ipfs://<cid>`), not a URL, so displaying images is a client decision that can
change without editing a single post.

New posts can only be created **inside a community page**: the post button is at
`/m/<name>`, and the editor shows the community as a fixed chip. There's no
separate community picker, because every post belongs to exactly where you're
standing.

## Replies

A reply is a post with a `parentId` other than `0`. Only the **direct parent** is
stored; the discussion tree is decided at read time, not a second field that must
be kept correct.

Replies:

- **Are never ranked.** They're excluded from every candidate source, so they
  never reach the algorithm. A debate displays chronologically; scoring it would
  turn the debate into a leaderboard.
- **Inherit the parent's community**, and are not gated: commenting does not
  require joining.

## Paths

| Form | Page |
|---|---|
| `/p/<id>` | Post by on-chain id (never changes) |
| `/u/<handle>/<n>` | The `n`th post of a handle |
| `/<handle>` or `/0x…` | Profile |
| `/<handle>/<n>` | The `n`th post of an account |

Since a handle can change owners, the on-chain id is the address that doesn't
drift.

## Saved

The **Save** button saves a post to **your device** (localStorage), not to the
chain. It's a private bookmark: saving on-chain would both cost a transaction and
publicize what you read. The **Saved** tab on the profile reads from there.

## Notifications

The indexer returns notifications for an address at `/notifications/<address>`:
who replied to, liked, or disliked your post/reply. The "read" marker is also
stored on the device, not on a server — marking something read on someone else's
behalf would only need their public address, and that isn't worth it.
