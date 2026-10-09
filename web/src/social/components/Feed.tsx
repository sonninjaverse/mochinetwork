"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { loadFeed, type FeedItem } from "@social/lib/feed";
import type { Strategy } from "@social/lib/indexer";
import { recallFeed, rememberFeed, useScrollRestore } from "@social/lib/nav-state";
import { watchNewPosts } from "@social/lib/realtime";
import { NewPostsPill } from "./NewPostsPill";
import Link from "next/link";
import { PendingPost } from "./PendingPost";
import { PostCard } from "./PostCard";
import { SignInButton } from "./SignInButton";
import { PostSkeleton } from "./Skeletons";

const ZERO = "0x0000000000000000000000000000000000000000" as const;

/// Ranking returns every candidate, but rendering hundreds at once costs a long
/// first paint for rows nobody scrolls to. The full ordering is already in
/// memory; this only limits what is mounted.
const PAGE = 25;

/// Start loading this far before the sentinel is actually on screen, so the
/// next batch is mounted by the time the reader gets there and the scroll
/// never visibly stops.
const PREFETCH_MARGIN = "600px";

/// Wait this long before admitting to loading at all.
///
/// A skeleton that appears and vanishes inside 80ms does not read as "loaded";
/// it reads as a flicker. Most loads here finish faster than this, so most
/// loads should show nothing and simply arrive.
///
/// Slowing the product down to look busy was the other option. It would have
/// undercut the one thing the demo exists to show.
const SKELETON_DELAY_MS = 180;

export function Feed({
  viewer,
  slot,
  algorithmOverride,
  strategy,
  community,
  pending = [],
  refreshToken,
  onRefreshed,
}: {
  viewer: Address | null;
  slot: number;
  algorithmOverride?: Address | null;
  strategy: Strategy;
  community?: string;
  /** Posts written by this viewer that the indexer may not have yet. */
  pending?: string[];
  /** Bumped by the page to ask for a refresh without remounting the list. */
  refreshToken?: number;
  /** Called after every refresh settles, so the page can stop its spinner. */
  onRefreshed?: () => void;
}) {
  /**
   * Identifies the feed itself, not the page showing it. Anything that would
   * change the ordering or the contents is part of the key, so a cache hit
   * can only ever be the same feed this reader last saw.
   *
   * Deliberately not the viewer: on a cold mount the wallet has not been read
   * yet, so a viewer-keyed cache would always miss exactly when it is needed
   * — coming back. The background refresh personalises the ordering either
   * way, and a feed this device saw is a feed this device saw.
   */
  const cacheKey = `${strategy}|${slot}|${algorithmOverride ?? ""}|${community ?? ""}`;

  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [shown, setShown] = useState(PAGE);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [error, setError] = useState(false);
  const sentinel = useRef<HTMLDivElement | null>(null);

  // Which key the items on screen belong to. When it moves, the old list is
  // another feed's and has to go rather than be updated.
  const loadedKey = useRef<string | null>(null);

  /**
   * The feed from last time, if there is one.
   *
   * Applied in a layout effect, before the browser paints: a reload should
   * show the list it was showing, but a server render cannot know about a
   * browser's cache and painting twice would flicker. The network request
   * still runs; it updates the list in place instead of replacing it with a
   * skeleton first.
   */
  const booted = useRef(false);
  useLayoutEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const cached = recallFeed(cacheKey);
    if (!cached || cached.items.length === 0) return;
    loadedKey.current = cacheKey;
    setItems(cached.items as FeedItem[]);
    setShown(cached.shown);
    setLoading(false);
  }, [cacheKey]);

  // Drop anything the indexer has caught up on, so a post is never shown twice.
  const indexed = new Set(items.map((i) => i.text));
  const unconfirmed = pending.filter((t) => !indexed.has(t));
  // Read from the realtime callback below, which closes over one render.
  const unconfirmedRef = useRef(false);
  useEffect(() => {
    unconfirmedRef.current = unconfirmed.length > 0;
  }, [unconfirmed.length]);

  /**
   * Counts requests so a stale answer cannot overwrite a fresh one.
   *
   * The first render has no viewer — localStorage is read in an effect — so a
   * feed is asked for as the zero address and then again as the real account.
   * The first of those takes two round trips whenever it falls back, so it can
   * finish last and replace the right feed with a signed-out one. The same
   * account saw a different feed run to run.
   */
  const run = useRef(0);

  // Kept in a ref so a page passing a new callback every render does not
  // restart the feed it is watching.
  const refreshed = useRef(onRefreshed);
  useEffect(() => {
    refreshed.current = onRefreshed;
  });

  const refresh = useCallback(async () => {
    const id = ++run.current;
    if (loadedKey.current !== cacheKey) {
      loadedKey.current = cacheKey;
      setItems([]);
      setShown(PAGE);
    }
    setLoading(true);
    setError(false);
    // A signed-out visitor still gets a feed; the zero address has no follows
    // and no affinity, which every algorithm handles as cold start.
    let result;
    try {
      result = await loadFeed(viewer ?? ZERO, slot, strategy, algorithmOverride ?? undefined, community);
    } catch {
      if (id === run.current) {
        setError(true);
        setLoading(false);
        refreshed.current?.();
      }
      return;
    }
    // A newer request owns the state now, including whether it is still loading.
    if (id !== run.current) return;
    setItems(result.items);
    // Paging is only reset above, when the list itself changed. A refetch of
    // the same feed leaves the reader where they were.
    setLoading(false);
    refreshed.current?.();
  }, [viewer, slot, strategy, algorithmOverride, community, cacheKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const lastToken = useRef(refreshToken ?? 0);
  useEffect(() => {
    if (refreshToken === undefined || refreshToken === lastToken.current) return;
    lastToken.current = refreshToken;
    void refresh();
  }, [refreshToken, refresh]);

  // Whatever is on screen is what coming back should find.
  useEffect(() => {
    if (items.length === 0 || loadedKey.current !== cacheKey) return;
    rememberFeed(cacheKey, { items, shown });
  }, [cacheKey, items, shown]);

  useEffect(() => {
    if (!loading) {
      setShowSkeleton(false);
      return;
    }
    const timer = setTimeout(() => setShowSkeleton(true), SKELETON_DELAY_MS);
    return () => clearTimeout(timer);
  }, [loading]);

  const applyPending = useCallback(async () => {
    setPendingCount(0);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    return watchNewPosts(() => {
      // A post the viewer just wrote is already on screen as a placeholder and
      // resolves itself. Counting it would offer them a post they can see.
      if (unconfirmedRef.current) void applyPending();
      // Anything else is genuinely new: count, do not re-rank. Re-ranking on
      // every event at roughly 300ms blocks would reshuffle the list under the
      // reader's finger.
      else setPendingCount((n) => n + 1);
    });
  }, [applyPending]);

  // The placeholder says it is waiting to be indexed, so actually wait: poll
  // until it lands rather than leaving the reader to press the pill. PostView
  // does the same for a reply.
  useEffect(() => {
    if (unconfirmed.length === 0) return;
    const timer = setInterval(() => void applyPending(), 4000);
    return () => clearInterval(timer);
  }, [unconfirmed.length, applyPending]);

  const hasMore = shown < items.length;

  // Put the reader back where they were, once there is a list to hold them.
  useScrollRestore(cacheKey, !loading || items.length > 0);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore) return;

    // IntersectionObserver rather than a scroll listener: the browser decides
    // when to tell us, so there is no per-frame work and nothing to throttle.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setShown((n) => n + PAGE);
      },
      { rootMargin: PREFETCH_MARGIN },
    );

    observer.observe(node);
    return () => observer.disconnect();
    // `shown` is a dependency because the sentinel moves after each batch and
    // the observer has to be pointed at its new position.
  }, [hasMore, shown]);

  if (strategy === "joined" && !viewer) {
    return <div className="feed-gate">
      <h2>Your communities, together</h2>
      <p>Sign in to see posts from communities you join, or <Link href="/m/">browse communities</Link>.</p>
      <SignInButton />
    </div>;
  }

  // An error only owns the page when there is nothing else to show. A failed
  // refresh behind a list that is already on screen keeps the list: stale is
  // better than replaced, and the reader did not ask for this one anyway.
  if (error && items.length === 0 && unconfirmed.length === 0) return <div className="state" role="alert">
    Could not load the feed. <button className="btn btn-quiet btn-sm" onClick={() => void refresh()}>Try again</button>
  </div>;

  if (loading && items.length === 0 && unconfirmed.length === 0) {
    // Nothing at all until the delay elapses. An empty frame beats a flicker.
    if (!showSkeleton) return <div className="feed-quiet" />;

    return (
      <div aria-busy="true" aria-label="Loading the feed">
        {Array.from({ length: 6 }, (_, i) => (
          <PostSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (items.length === 0 && unconfirmed.length === 0) {
    if (strategy === "joined") return <div className="feed-gate">
      <h2>No posts from your communities yet</h2>
      <p><Link href="/m/">Browse communities</Link> and join the ones you like.</p>
    </div>;
    if (strategy === "community") return <p className="state">No posts here yet. Start the conversation.</p>;

    return (
      <p className="state">
        Nothing here. This algorithm may be filtering everything out — try another.
      </p>
    );
  }

  return (
    <div>
      <NewPostsPill count={pendingCount} onClick={applyPending} />

      {unconfirmed.map((text) => (
        <PendingPost key={text} text={text} author={viewer} />
      ))}

      {items.slice(0, shown).map((item) => (
        <PostCard key={item.id} item={item} viewer={viewer} />
      ))}

      {/* No indicator: the next batch is already in memory, so there is
          nothing being fetched and claiming otherwise would be a lie. */}
      {hasMore && <div className="load-sentinel" ref={sentinel} aria-hidden />}

      {!hasMore && items.length > PAGE && (
        <p className="feed-end">That is everything this algorithm surfaced.</p>
      )}

    </div>
  );
}
