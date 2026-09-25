# Hosted Mochi

| Host | Service |
| --- | --- |
| `mochi.meme`, `www.mochi.meme` | Social app, Node.js 22 on port 3100 |
| `api.mochi.meme` | Indexer, Node.js 22 on port 8787 |
| `docs.mochi.meme` | Handbook, Cloudflare Pages project `mochi-handbook` |

Cloudflare Tunnel forwards the app and API hosts to the VPS. Keep their proxied
DNS records pointed at the tunnel and avoid Worker routes that intercept these
hosts. Domain and tunnel credentials stay outside this repository.

## App and docs

GitHub Actions builds and deploys changes on `main`. Set repository secrets
`VPS_HOST`, `VPS_PORT`, `VPS_USER`, and `VPS_SSH_KEY` for the app, plus
`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` for Pages. The SSH user needs
permission to write releases, restart `mochi-web`, and assign the render cache
to the service user. Configure the Pages custom domain separately.

Production browser settings are in `web/.env.production`; they are public build
values. Keep the passkey RP ID `mochi.meme` stable for existing accounts. Build
deployable releases from a clean checkout without local environment files:

```bash
pnpm --dir web install --frozen-lockfile
pnpm --dir web build
pnpm --dir web release
APP_HOST=your-ssh-host bash infra/deploy-app.sh
```

The app uses `mochi-web.service`, `/opt/mochi/node/bin/node`, and
`/opt/mochi/web/.env`. Releases live under `/opt/mochi/web/releases`; `current`
selects the active release. A failed restart or health check restores the
previous release. Old releases remain available for manual rollback.

## Indexer

The indexer's environment and SQLite database live in `/opt/mochi/indexer`.
Back up the database with SQLite's backup API before deployment, including any
pending WAL data. Then deploy source without replacing the environment or DB:

```bash
INDEXER_HOST=your-ssh-host bash infra/deploy-indexer.sh
```

The script installs production dependencies, restarts `mochi-indexer`, and waits
for `/health`. Initial backfill can take several minutes. The indexer environment
must set `WEB_ORIGINS=https://mochi.meme,https://www.mochi.meme`, contract addresses,
and RPC settings from `indexer/.env.example`. Preserve the existing database.

If using the optional invite gate, use the same `GATE_SECRET` in app and indexer,
`GATE_COOKIE_DOMAIN=mochi.meme`, and `GATE_WEB_ORIGIN=https://mochi.meme`.
Keep private keys, upload credentials, tunnel credentials, and SSH keys outside
Git. See the [deployment guide](../web/docs/reference/deploy.md) for local setup.

## Verify

Check the app at `https://mochi.meme`, the docs redirect at `/docs`, the handbook
at `https://docs.mochi.meme`, and `https://api.mochi.meme/health`. Ensure
`mochi-web`, `mochi-indexer`, and `mochi-tunnel` are enabled to survive a reboot.
