#!/usr/bin/env bash
# Ships the indexer source to the VPS and restarts it.
#
# Source only. .env holds the gate secret and the Pinata key, and mochi.db is
# the indexed state — both live on the host and are never overwritten from
# here. A wiped mochi.db has to be rebuilt from the deploy block, which takes
# hours on the public RPC.
set -euo pipefail

deploy_host="${INDEXER_HOST:?Set INDEXER_HOST to your SSH deployment host}"
DEST="${INDEXER_DIR:-/opt/mochi/indexer}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"

say() { printf '\n==> %s\n' "$*"; }

say "syncing source to $deploy_host:$DEST"
rsync -az --delete \
  --exclude node_modules --exclude '.env' --exclude 'mochi.db*' \
  "$HERE/indexer/src" "$HERE/indexer/seed" "$HERE/indexer/test" "$HERE/indexer/scripts" \
  "$HERE/indexer/package.json" "$HERE/indexer/package-lock.json" \
  "$HERE/indexer/tsconfig.json" "$HERE/indexer/README.md" \
  "$deploy_host:$DEST/"

say "installing dependencies"
# The host's own Node 22: better-sqlite3 segfaults under the system Node 20.
# --omit=dev is safe now that tsx is a real dependency rather than a dev one;
# the service runs the TypeScript directly, and an install that dropped tsx
# left the unit in a 203 exec loop with node_modules/.bin/tsx simply absent.
ssh "$deploy_host" "cd $DEST && PATH=/opt/mochi/node/bin:\$PATH npm ci --omit=dev --silent"

# A pgrep pattern that appears in the command running pgrep matches itself, and
# a wait on it never ends. Two loops have been lost to this; the fix is to
# match the process, not the words.
say "checking the entrypoint exists"
# Cheap, and it catches the failure that actually happened: a restart into a
# binary the install did not produce, which systemd reports only as status 203.
ssh "$deploy_host" "test -x $DEST/node_modules/.bin/tsx" \
  || { echo "tsx missing after install — not restarting into a crash loop"; exit 1; }

say "restarting"
ssh "$deploy_host" "sudo systemctl restart mochi-indexer"

say "health"
# A restart resumes from the last block that carried an event, and on a quiet
# chain that cursor can be hours behind the head. The backfill between the two
# has to finish before the server listens, so a fixed one-minute wait reports a
# failure for a deploy that is working. Half an hour covers more than a day of
# quiet blocks at the measured rate, and a progress line says it is moving
# rather than that it is stuck.
for i in $(seq 1 120); do
  if ssh "$deploy_host" "curl -sf localhost:8787/health" 2>/dev/null; then echo; exit 0; fi
  if [ $((i % 8)) -eq 0 ]; then
    ssh "$deploy_host" "journalctl -u mochi-indexer -n 1 --no-pager -o cat" 2>/dev/null || true
  fi
  sleep 15
done
echo "indexer did not answer /health in 30 minutes — check: ssh $deploy_host journalctl -u mochi-indexer -n 50"
exit 1
