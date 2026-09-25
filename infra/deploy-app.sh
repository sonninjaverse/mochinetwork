#!/usr/bin/env bash
# Ships a built web release to the VPS, switches to it and restarts the app.
#
# It does not build. The caller runs `pnpm build && pnpm release` in web/ first
# (.github/workflows/deploy-app.yml does), so the VPS never compiles anything
# and never holds the source. /opt/mochi/web/.env holds the server secrets and
# lives outside the releases; nothing here touches it.
#
# Every deploy is a new directory, /opt/mochi/web/releases/<commit>-<utc time>,
# and /opt/mochi/web/current points at the live one (infra/mochi-web.service
# runs from there). From the moment current moves until the new release answers,
# any way out of this script — a failed restart, a failed health check, Ctrl-C,
# a cancelled CI job — puts the previous release back, so a bad build costs a
# restart rather than an outage.
set -euo pipefail

deploy_host="${APP_HOST:?Set APP_HOST to your SSH deployment host}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
RELEASE="$HERE/web/release"
BASE=/opt/mochi/web

say() { printf '\n==> %s\n' "$*"; }
die() { echo "$*" >&2; exit 1; }

[ -f "$RELEASE/server.js" ] \
  || die "web/release/server.js is missing — build it first: cd web && pnpm build && pnpm release"
# A release left over from another checkout would be deployed under this
# commit's name. assemble-release.mjs records what it built.
[ -f "$RELEASE/COMMIT" ] \
  || die "web/release/COMMIT is missing — rebuild: cd web && pnpm build && pnpm release"
head_sha="$(git -C "$HERE" rev-parse HEAD)"
built_sha="$(tr -d '[:space:]' < "$RELEASE/COMMIT")"
[ "$built_sha" = "$head_sha" ] \
  || die "web/release was built from $built_sha but HEAD is $head_sha — rebuild before deploying"

# A new directory every time, even for the commit that is already live: rsync
# never writes into the directory the server is running from, and the previous
# release is always a different, intact directory to roll back to. --short=12
# because a shallow CI checkout and a full clone may otherwise abbreviate the
# same commit differently.
REL="$BASE/releases/$(git -C "$HERE" rev-parse --short=12 HEAD)-$(date -u +%Y%m%d%H%M%S)"

# /gate is never gated, so it answers with the page headers whatever
# GATE_SECRET says. The Host and X-Forwarded-Proto are what the tunnel sends; a
# CSP carrying a nonce means middleware ran, not just that a port is open.
healthy() {
  local headers
  headers="$(ssh "$deploy_host" "curl -sf -o /dev/null -D - -H 'Host: mochi.meme' -H 'X-Forwarded-Proto: https' http://127.0.0.1:3100/gate" 2>/dev/null)" \
    || return 1
  printf '%s\n' "$headers" | tr -d '\r' | grep -i '^content-security-policy:' | grep -q "'nonce-"
}

wait_healthy() {
  for _ in $(seq 1 30); do
    if healthy; then return 0; fi
    sleep 2
  done
  return 1
}

say "syncing web/release to $deploy_host:$REL"
ssh "$deploy_host" "mkdir $REL" \
  || die "could not create $REL on $deploy_host (it already exists, or $BASE/releases is missing)"
# A local run of release/server.js writes a render cache there; it is not part
# of the build.
rsync -az --exclude '/.next/cache/' "$RELEASE/" "$deploy_host:$REL/"
# Next writes its render cache under .next/cache, the only place the service
# may write; the rest of the release stays owned by the deploy user.
ssh "$deploy_host" "mkdir -p $REL/.next/cache && sudo chown -R mochiweb:mochiweb $REL/.next/cache"

PREV="$(ssh "$deploy_host" "readlink $BASE/current || true")"

# Points current back at PREV, restarts, and says plainly whether that worked.
# Never the reason to exit 0: the deploy failed either way.
roll_back() {
  if [ -z "$PREV" ]; then
    echo "no previous release to roll back to: $BASE/current still points at $REL, which is not serving" >&2
    return 1
  fi
  say "rolling back to $PREV"
  if ssh "$deploy_host" "ln -sfn $PREV $BASE/current && sudo systemctl restart mochi-web" && wait_healthy; then
    echo "rolled back: $PREV is serving again. The deploy of $REL failed." >&2
  else
    echo "ROLLBACK FAILED: $PREV does not answer either, so mochi.meme is down. Check: ssh $deploy_host journalctl -u mochi-web -n 50" >&2
    return 1
  fi
}

# idle → switched (current names REL, not yet confirmed) → live, or rolled-back.
state=idle
on_exit() {
  if [ "$state" = switched ]; then
    state=rolled-back
    echo "stopped before $REL was confirmed healthy" >&2
    roll_back || true
  fi
}
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

say "switching $BASE/current to $REL"
state=switched
ssh "$deploy_host" "ln -sfn $REL $BASE/current"
restarted=yes
ssh "$deploy_host" "sudo systemctl restart mochi-web" || restarted=no

# A failed restart may leave the old process up and answering, and a health
# check would then pass for the wrong release. Straight to the rollback.
if [ "$restarted" = yes ]; then
  say "health"
  if wait_healthy; then state=live; fi
else
  echo "systemctl restart mochi-web failed" >&2
fi

if [ "$state" != live ]; then
  if [ "$restarted" = yes ]; then echo "mochi-web did not serve /gate with a nonce CSP in 60s" >&2; fi
  # The failed release's own log, before the rollback's restart buries it.
  ssh "$deploy_host" "journalctl -u mochi-web -n 30 --no-pager" || true
  state=rolled-back
  roll_back || true
  exit 1
fi
trap - EXIT INT TERM
echo "serving $REL"

# Previous releases remain available for rollback. Prune them separately.
