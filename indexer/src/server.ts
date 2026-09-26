import { Hono } from "hono";
import { cors } from "hono/cors";
import { isAddress, type PublicClient } from "viem";
import type { Db } from "./db";
import { gateFromEnv, gateMiddleware, gateRoutes } from "./gate";
import { pushConfigured, removeSubscription, saveSubscription, syncPrefs } from "./push";
import { mediaRoutes } from "./media";
import { getCursor, HEARTBEAT_MS, type TailStatus } from "./ingest";
import {
  activity,
  candidates,
  communities,
  communityOf,
  isStrategy,
  postsByAuthor,
  addressForHandle,
  notifications,
  postByAuthorIndex,
  postByHandleIndex,
  postsByIds,
  profile,
  repliesTo,
  searchAccounts,
  STRATEGIES,
  thread,
} from "./queries";

/** A heartbeat older than this means the tail has stopped keeping up. */
const TAIL_STALE_MS = HEARTBEAT_MS * 4;

/**
 * Who the browser is allowed to call this API from.
 *
 * A fixed list rather than `*`: the gate cookie is sent with these requests,
 * and `*` is not allowed to carry credentials. The localhost entries are for
 * `next dev`; an unlisted origin still gets a normal, unsigned response.
 */
function webOrigins(): string[] {
  const raw =
    process.env.WEB_ORIGINS ??
    "http://localhost:3000,http://127.0.0.1:3000,http://127.0.0.1:3107,http://localhost:3107";
  return raw.split(",").map((origin) => origin.trim()).filter(Boolean);
}

export function createServer(
  db: Db,
  publicClient?: PublicClient,
  tail?: TailStatus,
) {
  const app = new Hono();
  app.use("/*", cors({ origin: webOrigins(), credentials: true }));

  // The gate, when configured. Its routes are registered before the middleware
  // so that /gate answers instead of being refused by its own check.
  const gate = gateFromEnv();
  if (gate) {
    app.route("/", gateRoutes(gate, db, [...new Set([...webOrigins(), gate.webOrigin])]));
    app.use("/*", gateMiddleware(gate));
  } else {
    app.get("/gate/status", c => c.json({ enabled: false, open: true, address: null }));
  }

  /**
   * Reports liveness separately from progress.
   *
   * The cursor only advances when a block contains events, so on a quiet chain
   * it can sit thousands of blocks behind while the indexer is working
   * perfectly. Reporting the cursor alone made an idle indexer look identical
   * to a dead one — which, during judging, reads as a broken service.
   *
   * `head` is fetched live, so failing to reach the chain shows up as
   * reachable: false rather than as a stale number.
   */
  app.get("/health", async (c) => {
    const posts = (db.prepare("SELECT COUNT(*) AS n FROM posts").get() as any).n;
    const cursor = getCursor(db);

    let head: number | null = null;
    try {
      if (publicClient) head = Number(await publicClient.getBlockNumber());
    } catch {
      head = null;
    }

    // How long ago the tail last reached the chain. This, not the cursor, is
    // what says the indexer is still watching.
    const tailAgeMs = tail && tail.at > 0 ? Date.now() - tail.at : null;

    return c.json({
      ok: true,
      reachable: head !== null,
      // Backfill finishes before this server starts listening, so an answer
      // here plus a fresh heartbeat means nothing on chain is unaccounted for.
      live: tailAgeMs !== null && tailAgeMs < TAIL_STALE_MS,
      tailAgeMs,
      posts,
      cursor,
      head,
      // Blocks since the last one that actually contained an event. High is
      // normal on a quiet chain; it is not a measure of lag.
      blocksSinceLastEvent: head === null ? null : head - cursor,
      // Push is a pipeline of its own; whether it is armed is worth being able
      // to see from outside.
      push: {
        configured: pushConfigured(),
        subscriptions: (db.prepare("SELECT COUNT(*) AS n FROM push_subscriptions").get() as { n: number }).n,
      },
    });
  });

  app.get("/candidates", (c) => {
    const requested = c.req.query("strategy");
    const strategy = isStrategy(requested) ? requested : "recent";
    const limit = Number(c.req.query("limit") ?? 500);
    const viewer = c.req.query("viewer") ?? undefined;

    return c.json({
      strategy,
      ids: candidates(db, strategy, Number.isFinite(limit) ? limit : 500, viewer, c.req.query("community")),
    });
  });

  app.get("/strategies", (c) => c.json({ strategies: STRATEGIES }));

  app.get("/communities", c => c.json({ communities: communities(
    db, c.req.query("viewer"), c.req.query("q") ?? "", Number(c.req.query("limit") ?? 100), Number(c.req.query("offset") ?? 0),
  ) }));

  app.get("/communities/:name", c => {
    const community = communityOf(db, c.req.param("name"), c.req.query("viewer"));
    return community ? c.json({ community }) : c.json({ error: "no such community" }, 404);
  });

  app.get("/profile/:address", (c) => {
    const address = c.req.param("address");
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return c.json({ error: "invalid address" }, 400);
    }
    const limit = Number(c.req.query("limit") ?? 50);
      const capped = Number.isFinite(limit) ? limit : 50;
      return c.json({
        profile: profile(db, address),
        ids: postsByAuthor(db, address, capped, false),
        commentIds: postsByAuthor(db, address, capped, true),
      });
  });

  /**
   * Resolves /@handle/<n> to a post id, and /@handle to an address.
   *
   * The handle is looked up live, so a link written before a rename resolves
   * to whoever holds that name now. That is the cost of a readable URL, and
   * why /posts by id stays the address that cannot drift.
   */
  app.get("/by-handle/:handle/:n", (c) => {
    const n = Number(c.req.param("n"));
    if (!Number.isInteger(n) || n < 1) return c.json({ error: "invalid index" }, 400);

    const id = postByHandleIndex(db, c.req.param("handle"), n);
    return id ? c.json({ id }) : c.json({ error: "no such post" }, 404);
  });

  /** An account's nth post. The address form, which never changes hands. */
  app.get("/by-author/:address/:n", (c) => {
    const n = Number(c.req.param("n"));
    if (!Number.isInteger(n) || n < 1) return c.json({ error: "invalid index" }, 400);

    const id = postByAuthorIndex(db, c.req.param("address"), n);
    return id ? c.json({ id }) : c.json({ error: "no such post" }, 404);
  });

  app.get("/by-handle/:handle", (c) => {
    const address = addressForHandle(db, c.req.param("handle"));
    return address ? c.json({ address }) : c.json({ error: "no such handle" }, 404);
  });

  /** Accounts matching a name prefix, or the one at a whole address. */
  app.get("/search", (c) => {
    const q = c.req.query("q") ?? "";
    return c.json({ results: searchAccounts(db, q, Number(c.req.query("limit") ?? 8)) });
  });

  /** What has happened to this account, newest first. */
  app.get("/notifications/:address", (c) => {
    const address = c.req.param("address");
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return c.json({ error: "invalid address" }, 400);

    return c.json({
      notifications: notifications(db, address, Number(c.req.query("limit") ?? 50)),
    });
  });

  /** Recent posts in the communities a reader watches, for the bell. */
  app.get("/activity", (c) => {
    const communities = (c.req.query("communities") ?? "").split(",");
    const since = Number(c.req.query("since") ?? 0);
    const limit = Number(c.req.query("limit") ?? 100);
    return c.json({
      activity: activity(
        db,
        communities,
        Number.isFinite(since) ? since : 0,
        Number.isFinite(limit) ? limit : 100,
      ),
    });
  });

    /** One post's replies, oldest first. Ids only; /posts returns the content. */
    app.get("/replies/:id", (c) => {
      const id = c.req.param("id");
      if (!/^\d+$/.test(id)) return c.json({ error: "invalid id" }, 400);
      return c.json({ ids: repliesTo(db, id, Number(c.req.query("limit") ?? 200)) });
    });

    /** One post's whole thread, flattened. The client rebuilds the tree. */
    app.get("/thread/:id", (c) => {
      const id = c.req.param("id");
      if (!/^\d+$/.test(id)) return c.json({ error: "invalid id" }, 400);
      return c.json({ ids: thread(db, id) });
    });

  app.get("/posts", (c) => {
    const raw = c.req.query("ids") ?? "";
    // Cap the batch: ids come straight from a query string, and an unbounded
    // IN clause is an easy way for a caller to stall the process.
    const ids = raw
      .split(",")
      .filter((s) => /^\d+$/.test(s))
      .slice(0, 1000);
    return c.json({ posts: postsByIds(db, ids, c.req.query("viewer")) });
  });

  /**
   * Web Push subscriptions. The browser sends its endpoint and keys plus a
   * copy of its notification preferences, because the push is sent from here
   * with no browser awake to consult.
   */
  app.post("/push/subscribe", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      address?: string;
      subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      prefs?: unknown;
    } | null;
    const address = String(body?.address ?? "");
    const sub = body?.subscription;
    if (!isAddress(address) || !sub?.endpoint || !sub.keys?.p256dh || !sub.keys.auth) {
      return c.json({ error: "invalid subscription" }, 400);
    }
    saveSubscription(
      db,
      address,
      { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
      (body?.prefs ?? {}) as never,
    );
    return c.json({ ok: true });
  });

  app.post("/push/prefs", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { address?: string; prefs?: unknown } | null;
    const address = String(body?.address ?? "");
    if (!isAddress(address)) return c.json({ error: "invalid address" }, 400);
    syncPrefs(db, address, (body?.prefs ?? {}) as never);
    return c.json({ ok: true });
  });

  app.post("/push/unsubscribe", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { endpoint?: string } | null;
    if (body?.endpoint) removeSubscription(db, String(body.endpoint));
    return c.json({ ok: true });
  });

  // Uploads need only a Pinata key, not the chain, so they mount regardless.
  app.route("/", mediaRoutes());

  return app;
}
