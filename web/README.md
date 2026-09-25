# Mochi Network web

Next.js social app at [mochi.meme](https://mochi.meme) and a separate VitePress
handbook at [docs.mochi.meme](https://docs.mochi.meme). The app includes communities,
posts, replies, karma-weighted voting, user-selectable feed algorithms, passkey
accounts, notifications, and local bookmarks.

## Development

Use Node.js 24 and pnpm 10. From this directory:

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Open http://localhost:3000. Run the [indexer](../indexer/) at
http://localhost:8787 for post content and candidate lists. All network reads and
wallet writes use `NEXT_PUBLIC_MONAD_CHAIN_ID` and `NEXT_PUBLIC_MONAD_RPC_HTTP`.
The default contract addresses are published Monad testnet deployments.

```bash
pnpm docs:dev --port 5174
pnpm docs:build
pnpm docs:preview
```

The Docs link redirects to `NEXT_PUBLIC_DOCS_URL` (default http://localhost:5174).
Set `DOCS_APP_URL` when building the handbook to configure its Open app link.

## Build and check

```bash
pnpm test
pnpm build
pnpm docs:build
pnpm test:e2e
```

The browser tests require Foundry, installed indexer dependencies, and Playwright
Chromium (`pnpm exec playwright install chromium`). They run against a disposable
local chain. See the [repository README](../README.md).

`pnpm build` bundles the algorithm sources from `../contracts/src/algorithms`.
`pnpm release` assembles a portable `release/` directory; run it with
`HOSTNAME=0.0.0.0 PORT=3000 node release/server.js`. Assemble from a clean build
without local secret files: the release packager refuses `.env.local` and other
private environment files. `pnpm start` can also serve a normal local build.

## Configuration

`.env.example` documents the supported settings. `.env.production` contains only
public testnet values and the production domains. `.env.example` keeps localhost
defaults for local development. `NEXT_PUBLIC_*` values are baked into
the browser bundle, so rebuild after changing them. Set deployment URLs explicitly
and keep WebAuthn's relying party stable for existing passkeys.
