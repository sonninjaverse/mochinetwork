# Mochi indexer

Reads Monad testnet logs into SQLite and serves candidate sets and post content.
Chain event tables can be rebuilt from logs. Invitations and browser sessions
are local application data: preserve them in database backups.

## A dedicated RPC provider is required

The public endpoint `testnet-rpc.monad.xyz` rejects `eth_getLogs` over a
100-block range with code `-32614`. Monad produces roughly **288,000 blocks a
day** at 300ms, so backfilling from the deploy block costs `blocks / 100`
sequential requests — after a week that is about 20,000 of them.

Use one of the providers the hackathon supplies free (QuickNode, Dwellir,
Tenderly) and raise `LOG_CHUNK_SIZE` to match their limit.

**Keep `mochi.db` alive.** Rebuilding from scratch gets more expensive every
hour. A persistent database means each restart only has to catch up a few
blocks. Chain history remains independently verifiable and rebuildable, but resetting
the database would also lose invitation and session state.

## Environment

| Variable | Meaning |
|---|---|
| `MONAD_CHAIN_ID` | 10143 for testnet |
| `MONAD_RPC_HTTP` | HTTP RPC, used for backfill |
| `MONAD_RPC_WS` | WebSocket RPC for the live tail. Falls back to HTTP polling |
| `POST_REGISTRY`, `IDENTITY_REGISTRY`, `COMMUNITY_REGISTRY` | From `contracts/DEPLOYED.md` |
| `DEPLOY_BLOCK` | Block the contracts were deployed in |
| `COMMUNITY_REGISTRY` | Optional community registry address |
| `COMMUNITY_DEPLOY_BLOCK` | Required with the registry; its deployment block |
| `LOG_CHUNK_SIZE` | Blocks per `eth_getLogs`. 100 on the public RPC |
| `DB_PATH` | Defaults to `./mochi.db` |
| `PORT` | Defaults to 8787 |

## Run

    npm ci
    cp .env.example .env
    npm run dev

The dev command loads `.env`. Set `WEB_ORIGINS` to the social app origin when
deploying; the defaults allow local development.

## Endpoints

    GET /health
    GET /candidates?strategy=recent|trending&limit=500
    GET /posts?ids=1,2,3
    GET /candidates?strategy=community&community=monad
    GET /candidates?strategy=joined&viewer=0x...
    GET /communities?q=mon&viewer=0x...&offset=0
    GET /communities/monad?viewer=0x...
    GET /profile/0x...

Profiles return `postKarma` and `commentKarma`; posts include `authorKarma`
and `community`. Community lists are alphabetical, limited to 100 per page.

Schema changes run in place. Never delete the database to add communities or
karma. See [communities and karma](../contracts/docs/communities.md) for the
rollout instructions.

The indexer picks which posts are considered and returns their content. It
never scores anything: ranking happens on chain, while candidate selection can
still influence which posts appear.

## Regenerating demo data

Order matters. `npm run seed <step>` runs one step at a time
(`seed/run.ts`); the steps are `fund`, `anchors`, `posts`, `likes`,
`dislikes`, in that order.

## Invitations

With `GATE_SECRET` configured, the gate accepts single-use invitations. Each
wallet admitted with a signed, expiring challenge gets three personal codes.
Codes, referrals and hashed sessions persist in the same SQLite database.
`GATE_CODES` seeds bootstrap invitations once; restarting never refreshes a code.

Issue additional bootstrap invitations on the host with `npm run invites -- 3`.
The command prints codes for private distribution; never commit the output.
Back up `mochi.db` with SQLite's backup API before deployment and preserve all
`invite_*` tables. Existing indexed participants are grandfathered once when
invitations are first enabled. New on-chain activity cannot bypass admission.
