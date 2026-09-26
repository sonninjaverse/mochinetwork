# Indexer API

Production base URL: `https://api.mochi.meme`. Local development: `http://localhost:8787`.

The indexer returns **candidate lists** and **content**. It does not rank: every
score is an `eth_call` to the contracts. See
[System architecture](/reference/architecture).

## Authentication

When enabled, the invite gate protects content routes. `/health` and sign-in
endpoints stay open; `/gate/invites` separately requires an account session.
Content requests carry the `mochi_gate` cookie issued by `POST /gate` or
`POST /gate/session`. The cookie is
verified with HMAC over the same secret the web middleware uses.

CORS allows only the origins in `WEB_ORIGINS`
configured with `WEB_ORIGINS` (localhost is allowed during development).
Requests carry credentials; `*` is not allowed because the cookie is attached.

```bash
# /health stays open without an invitation
curl http://localhost:8787/health
```

## Endpoint summary

| Method | Path | Parameters | Returns |
|---|---|---|---|
| GET | `/health` | — | Liveness, cursor, post count |
| GET | `/strategies` | — | List of valid strategies |
| GET | `/candidates` | `strategy`, `limit`, `community`, `viewer` | `{ strategy, ids }` |
| GET | `/posts` | `ids`, `viewer` | `{ posts }` |
| GET | `/communities` | `q`, `viewer`, `limit`, `offset` | `{ communities }` |
| GET | `/communities/:name` | `viewer` | `{ community }` or 404 |
| GET | `/profile/:address` | `limit` | `{ profile, ids, commentIds }` |
| GET | `/by-handle/:handle` | — | `{ address }` or 404 |
| GET | `/by-handle/:handle/:n` | — | `{ id }` or 404 |
| GET | `/by-author/:address/:n` | — | `{ id }` or 404 |
| GET | `/search` | `q`, `limit` | `{ results }` |
| GET | `/notifications/:address` | `limit` | `{ notifications }` |
| GET | `/activity` | `communities`, `since`, `limit` | `{ activity }` |
| GET | `/replies/:id` | `limit` | `{ ids }` |
| GET | `/thread/:id` | — | `{ ids }` |
| POST | `/gate` | form `code`, `next` | 303 + set-cookie |
| GET | `/gate/status` | — | `{ enabled, open, address }` |
| POST | `/gate/challenge` | JSON `address` | `{ id, message }`, expires in 5 minutes |
| POST | `/gate/session` | JSON `id`, `signature` | verifies wallet, sets cookies |
| GET | `/gate/invites` | account session cookie | own codes, remaining, joined |
| POST | `/gate/logout` | — | revokes session, clears cookies, JSON |
| POST | `/gate/out` | — | 303, clears cookie |
| POST | `/push/subscribe` | JSON subscription + prefs | `{ ok }` |
| POST | `/push/prefs` | JSON `address`, `prefs` | `{ ok }` |
| POST | `/push/unsubscribe` | JSON `endpoint` | `{ ok }` |
| POST | `/media` | multipart `file` | `{ cid, uri }` |

## `/health`

Open route. `live` is the signal to trust:

```json
{
  "ok": true,
  "reachable": true,
  "live": true,
  "tailAgeMs": 1200,
  "posts": 4213,
  "cursor": 63656426,
  "head": 63412000,
  "blocksSinceLastEvent": 32110
}
```

| Field | Meaning |
|---|---|
| `reachable` | Whether the latest head block can be read |
| `live` | Tail just touched the chain within the heartbeat threshold |
| `tailAgeMs` | How long since the tail touched the chain; `null` if never |
| `cursor` | Last block **with an event**. Does not advance when the chain is quiet |
| `head` | Live-read head block, `null` if unreachable |
| `blocksSinceLastEvent` | `head − cursor`. High is normal, not lag |

::: tip Reading it correctly
`cursor` stands still on a quiet chain while the indexer is running fine. Trust
`live`, not the block gap.
:::

## `/strategies`

```json
{ "strategies": ["recent", "popular", "trending", "community", "joined"] }
```

## `/candidates`

Selects the posts an algorithm will consider. **Comments are always excluded from
every strategy**: a comment detached from its thread is a fragment, and the ranking
contract has no way to know that.

| Parameter | Default | Notes |
|---|---|---|
| `strategy` | `recent` | An invalid name also falls back to `recent` |
| `limit` | `500` | Clamped to 1…1000 |
| `community` | — | Required with `strategy=community` |
| `viewer` | — | Required with `strategy=joined` |

The five strategies:

| Strategy | Source | Order |
|---|---|---|
| `recent` | All root posts (`parentId = "0"`) | Newest first |
| `popular` | Root posts **with** a non-empty `community` | Newest first |
| `trending` | Root posts within 24 hours | Most active likes first, then newest |
| `community` | Root posts in the `community` community | Newest first |
| `joined` | Root posts in communities `viewer` has joined | Newest first |

`popular` skips posts with no community label; posts are immutable, so filtering is
the only honest way to exclude them from this one feed.

```json
{ "strategy": "popular", "ids": ["1042", "1039", "1031"] }
```

```bash
curl -H 'Cookie: mochi_gate=...' \
  'http://localhost:8787/candidates?strategy=trending&limit=200'
```

## `/posts`

Returns content for a list of ids. `ids` is a comma-separated numeric string,
at most 1000 ids (the excess is truncated).

| Parameter | Default | Notes |
|---|---|---|
| `ids` | — | Example `ids=1,2,3` |
| `viewer` | — | Address, to fill `viewerVote` |

Each element in `posts`:

| Field | Type | Meaning |
|---|---|---|
| `id` | string | On-chain id |
| `community` | string | Community label, `""` if none |
| `author` | string | Author address |
| `handle` | string \| null | Current handle |
| `text` | string | Content |
| `createdAt` | number | Unix seconds |
| `mediaURI` | string | `""` or content address (`ipfs://…`) |
| `parentId` | string | `"0"` for a root post, otherwise the parent post |
| `replyCount` | number | Number of direct replies |
| `authorIndex` | number | Which post by the author (1-based) |
| `likeCount` | number | Number of likers, **raw** |
| `dislikeCount` | number | Number of dislikers, **raw** |
| `viewerVote` | `"up"` \| `"down"` \| null | Requires `viewer`; `null` when there is no vote |
| `authorKarma` | number | Author's `postKarma + commentKarma` |

```json
{
  "posts": [
    {
      "id": "1042",
      "community": "monad",
      "author": "0xabc...",
      "handle": "alice",
      "text": "m/monad first post",
      "createdAt": 1726000000,
      "mediaURI": "",
      "parentId": "0",
      "replyCount": 3,
      "authorIndex": 5,
      "likeCount": 14,
      "dislikeCount": 2,
      "viewerVote": "up",
      "authorKarma": 220
    }
  ]
}
```

## `/communities`

Lists communities in **alphabetical** order, matching a name prefix.

| Parameter | Default | Notes |
|---|---|---|
| `q` | `""` | Prefix match, case-insensitive |
| `viewer` | — | To fill `joined` |
| `limit` | `100` | Clamped 1…100 |
| `offset` | `0` | |

`GET /communities/:name` returns one community or 404 `{ "error": "no such community" }`.

| Field | Type | Meaning |
|---|---|---|
| `name` | string | Community name (lowercase) |
| `creator` | string | Creator address |
| `metadataURI` | string | Metadata URI |
| `createdAt` | number | Unix seconds |
| `memberCount` | number | Number of active members |
| `postCount` | number | Number of root posts in the community |
| `joined` | boolean | Whether `viewer` has joined |

## `/profile/:address`

`address` must be `0x` + 40 hex characters, otherwise 400.

| Parameter | Default | Notes |
|---|---|---|
| `limit` | `50` | Clamped 1…200, applies to both `ids` and `commentIds` |

```json
{
  "profile": {
    "address": "0xabc...",
    "handle": "alice",
    "posts": 5,
    "comments": 12,
    "joined": 1726000000,
    "votes": 9,
    "postKarma": 220,
    "commentKarma": 40
  },
  "ids": ["1042", "1010"],
  "commentIds": ["1050", "1049"]
}
```

`ids` are root posts (Posts), `commentIds` are comments (Comments). `postKarma` and
`commentKarma` are weighted caches; the official number remains
`PostRegistry.karmaOf`, read directly from the chain. `joined` is the time of the
**first** post, not the time the handle was registered.

## Handle and post addressing

| Endpoint | Returns | Notes |
|---|---|---|
| `/by-handle/:handle` | `{ "address": "0x…" }` | Handle resolved live, can change owner |
| `/by-handle/:handle/:n` | `{ "id": "1042" }` | The `n`-th post of the current handle |
| `/by-author/:address/:n` | `{ "id": "1042" }` | The `n`-th post by address, does not drift |

`n` must be an integer ≥ 1. Because a handle can change owner, the address is what
never drifts; addressing `/posts` by id is the most durable.

## `/search`

`limit` defaults to `8`, clamped 1…25. Addresses are searched **in full**; names are
searched by prefix, ordered by post count descending.

```json
{ "results": [{ "address": "0xabc...", "handle": "alice", "posts": 5 }] }
```

## `/notifications/:address`

`address` must be correctly formatted, otherwise 400. `limit` defaults to `50`,
clamped 1…200. Your own actions are excluded.

| Field | Type | Meaning |
|---|---|---|
| `kind` | `"reply"` \| `"like"` \| `"dislike"` | Notification type |
| `actor` | string | Who did it |
| `actorHandle` | string \| null | That person's handle |
| `postId` | string \| null | The affected post |
| `replyId` | string \| null | The comment, when `kind=reply` |
| `text` | string \| null | Related content |
| `block` | number | Block, used for sorting and estimating time |
| `weight` | number \| null | The vote's weight on like/dislike; null on a reply |

Sorted by block descending. Like/dislike carry no timestamp in the event, so the
client estimates time from block height.

## `/activity`

Recent top-level posts in the communities named in `communities` (comma
separated), after block `since`. `limit` defaults to `100`, clamped 1…200. This
is a plain read for the notification bell: **which** of these a reader wants to
see is a client preference, so no preference is applied here.

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Post id |
| `community` | string | Community name |
| `author` | string | Author address |
| `handle` | string \| null | Author's handle |
| `text` | string | Post text |
| `block` | number | Block it landed in |
| `createdAt` | number | Unix seconds |
| `weightedLikes` | number | Weighted likes, the same 100-point scale karma uses |

```bash
curl -H 'Cookie: mochi_gate=...' \
  'http://localhost:8787/activity?communities=cats,monad&since=63380000'
```

## `/replies/:id` and `/thread/:id`

`id` must be a numeric string, otherwise 400.

- `/replies/:id` returns **direct children**, oldest first. `limit` defaults to `200`,
  clamped 1…500.
- `/thread/:id` returns **all descendants**, flattened, so the client can rebuild the
  tree itself. At most 2000 ids.

```json
{ "ids": ["1050", "1049", "1051"] }
```

Comments are never ranked; they are read chronologically.

## Gate

| Endpoint | Use |
|---|---|
| `POST /gate` | Form `code` and `next`; sets the cookie then 303 to `next` |
| `GET /gate/status` | `{ enabled, open, address }`, always 200 |
| `POST /gate/out` | Revokes the invite session, clears cookies, 303 to `/gate/` |

Invite links use `/gate?code=…` on the web app and only prefill the form. A code
is spent atomically when `POST /gate` accepts it; repeated submissions fail.
The recipient then proves their wallet through `/gate/challenge` and
`/gate/session`. The signed message binds the account, domain, nonce and expiry;
challenges cannot be replayed or moved between pending browser sessions.

`GET /gate/invites` requires the additional HttpOnly `mochi_invite` cookie issued
after account proof. A wallet address in the query or the older read cookie is
insufficient. Responses are private and not cached. Codes report `usedAt`,
`usedBy` and an optional indexed handle; acceptance without account creation
appears as pending. Quotas do not refill on login. `/gate/logout` revokes the
current account session and returns JSON for the app's sign-out action.

`next` accepts only internal paths; `//evil.com` is treated as `/`.

## `/push/*`

Web Push, so a reader can be told with the app closed. The browser sends its
push subscription and **a copy of its notification preferences**, because the
push is sent from here with no browser awake to consult.

- `POST /push/subscribe` — `{ address, subscription: { endpoint, keys }, prefs }`.
  One row per endpoint; re-subscribing with a different address moves it.
- `POST /push/prefs` — `{ address, prefs }`, updates the copy for each of that
  address's endpoints.
- `POST /push/unsubscribe` — `{ endpoint }`, forgets one browser.

Sending needs `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` on
the indexer. Without them push stays off and only the bell works.

## Media upload

`POST /media` accepts multipart with a `file` field (PNG, JPEG, WebP, or GIF, at most
5 MB) and returns `{ "cid": "bafy…", "uri": "ipfs://bafy…" }`. Only the CID goes
on-chain; the image bytes live on IPFS.
