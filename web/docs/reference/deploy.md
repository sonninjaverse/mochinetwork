# Running and deploying Mochi

The social app, indexer, and handbook run independently. Configure your own hosts;
no cloud account, DNS zone, or production server is required to build the repo.

The hosted app uses **https://mochi.meme**, the handbook uses
**https://docs.mochi.meme**, and the indexer uses **https://api.mochi.meme**.
Production pins `NEXT_PUBLIC_RP_ID=mochi.meme` to preserve passkeys on the apex and `www`.

## Requirements

- Node.js 24 and pnpm 10.
- Foundry for contract tests, deployments, and local browser tests.
- A Monad testnet RPC endpoint for a testnet deployment.
- Persistent disk for the indexer's SQLite database.

## Local development

Install the repository's dependencies:

```bash
git submodule update --init --recursive
npm --prefix indexer ci
pnpm --dir web install --frozen-lockfile
cp indexer/.env.example indexer/.env
cp web/.env.example web/.env.local
```

Run each command in a separate terminal:

```bash
npm --prefix indexer run dev
pnpm --dir web dev
pnpm --dir web docs:dev --port 5174
```

The social app is at `http://localhost:3000`, the API at `http://localhost:8787`,
and the handbook at `http://localhost:5174`. The indexer completes its initial
backfill before it serves HTTP. Use a dedicated RPC and configure `LOG_CHUNK_SIZE`
for that provider's log range limit. Keep the SQLite file across restarts.

## Configure a deployment

| Component | Configuration |
| --- | --- |
| Social app | `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_DOCS_URL`, `NEXT_PUBLIC_INDEXER_URL` |
| Chain reads and wallet writes | `NEXT_PUBLIC_MONAD_CHAIN_ID`, `NEXT_PUBLIC_MONAD_RPC_HTTP`, optional `NEXT_PUBLIC_MONAD_RPC_WS` |
| Social contracts | `NEXT_PUBLIC_IDENTITY_REGISTRY`, `NEXT_PUBLIC_POST_REGISTRY`, `NEXT_PUBLIC_ALGORITHM_REGISTRY`, `NEXT_PUBLIC_COMMUNITY_REGISTRY` |
| Indexer | Contract addresses, `DEPLOY_BLOCK`, `COMMUNITY_DEPLOY_BLOCK`, RPC URLs, `DB_PATH`, `WEB_ORIGINS` |
| Handbook | `DOCS_APP_URL` for its Open app link |
| Passkeys | Optional `NEXT_PUBLIC_RP_ID`; defaults to the current hostname |

Browser variables are build-time settings. Use HTTPS for public deployments.
Passkeys are scoped to a relying party: set a stable parent host if the app uses
multiple subdomains, and keep it unchanged for existing accounts.

## Build the social app

```bash
cd web
pnpm build
pnpm start
```

For a portable Node.js directory, run `pnpm release` after building and copy
`web/release/` to the host. Start it with:

```bash
HOSTNAME=0.0.0.0 PORT=3000 node server.js
```

The packager includes runtime dependencies, assets, and the source commit marker.
It refuses private environment files. Build a release from a clean checkout using
environment variables; keep server-only secrets outside the release directory.

## Build the handbook

```bash
cd web
DOCS_APP_URL=https://social.example pnpm docs:build
pnpm docs:preview
```

Publish `web/docs/.vitepress/dist/` to a static host. Set the social app's
`NEXT_PUBLIC_DOCS_URL` to that host. The `/docs` route redirects there, including
nested paths. Configure the host to resolve clean URLs to the generated HTML files.

## Run the indexer

```bash
cd indexer
npm ci
cp .env.example .env
# Configure the deployment addresses, RPC, storage, and allowed web origins.
npm run dev
```

The production app and handbook deploy through GitHub Actions. The app runs as
a standalone Node.js service behind a Cloudflare Tunnel; the handbook is a
Cloudflare Pages project. Configure the repository secrets described in
`infra/README.md` for your own deployment. The indexer runs separately with
persistent SQLite storage. Check `GET /health` after startup.

Optional services:

- `PINATA_JWT` enables image uploads; otherwise uploads return 503.
- A VAPID key pair enables Web Push. Only the public half belongs in the web app.
- `GATE_SECRET` enables an invite gate. Leave it unset for a public demo. If used,
  configure the same secret in the app and indexer, plus initial single-use `GATE_CODES`,
  `GATE_WEB_ORIGIN`, and an appropriate shared `GATE_COOKIE_DOMAIN`.

### Invitation state

The indexer stores invitations, account admission, and sessions in SQLite.
Every admitted account gets three single-use codes after proving ownership with
its passkey wallet. Existing indexed participants are admitted once on migration;
future on-chain activity does not bypass invitations. Existing read cookies keep
working, but do not grant access to personal invite codes without account proof.
A passkey with no prior indexed activity still needs an invitation once.

Bootstrap codes in `GATE_CODES` are imported without resetting their usage.
Generate additional operator invitations on the indexer host:

```bash
cd indexer
npm run invites -- 3
```

This prints new codes for private distribution. Keep them out of commits and CI
logs. Back up the entire database, including `invite_*` tables, before upgrades.
Deploy the indexer before the web app when introducing invitation endpoints.

## Deploy the contracts

The existing testnet addresses are in [Contracts and addresses](/reference/contracts).
To deploy your own instance:

```bash
cd contracts
cp .env.example .env
# Set MONAD_TESTNET_RPC and a funded testnet PRIVATE_KEY in .env.
set -a && . ./.env && set +a
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$MONAD_TESTNET_RPC" --private-key "$PRIVATE_KEY" --broadcast
```

Update the web and indexer addresses and deployment blocks from the receipts.
Never publish the deployment key or local environment files.

## Verification

CI runs contract tests, indexer type checks and tests, web type checks and tests,
and both web and handbook builds. It runs on pushes and pull requests.

For an isolated browser demo, install Chromium and run `pnpm --dir web test:e2e`.
The harness starts Anvil, deploys contracts, seeds posts, and serves the real app
and indexer. No Monad funds or external credentials are needed.
