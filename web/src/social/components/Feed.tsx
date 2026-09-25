"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { loadFeed, type FeedItem } from "@social/lib/feed";
import type { Strategy } from "@social/lib/indexer";
import { watchNewPosts } from "@social/lib/realtime";
import { NewPostsPill } from "./NewPostsPill";
import Link from "next/link";
import { PendingPost } from "./PendingPost";
import { PostCard } from "./PostCard";
import { SignInButton } from "./SignInButton";

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
}: {
  viewer: Address | null;
  slot: number;
  algorithmOverride?: Address | null;
  strategy: Strategy;
  community?: string;
  /** Posts written by this viewer that the indexer may not have yet. */
  pending?: string[];
}) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [shown, setShown] = useState(PAGE);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [error, setError] = useState(false);
  const sentinel = useRef<HTMLDivElement | null>(null);

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

  const refresh = useCallback(async () => {
    const id = ++run.current;
    setLoading(true);
    setError(false);
    // A signed-out visitor still gets a feed; the zero address has no follows
    // and no affinity, which every algorithm handles as cold start.
    let result;
    try {
      result = await loadFeed(viewer ?? ZERO, slot, strategy, algorithmOverride ?? undefined, community);
    } catch {
      if (id === run.current) { setError(true); setLoading(false); }
      return;
    }
    // A newer request owns the state now, including whether it is still loading.
    if (id !== run.current) return;
    setItems(result.items);
    setShown(PAGE);
    setLoading(false);
  }, [viewer, slot, strategy, algorithmOverride, community]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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

  if (error) return <div className="state" role="alert">
    Could not load the feed. <button className="btn btn-quiet btn-sm" onClick={() => void refresh()}>Try again</button>
  </div>;

  if (loading && unconfirmed.length === 0) {
    // Nothing at all until the delay elapses. An empty frame beats a flicker.
    if (!showSkeleton) return <div className="feed-quiet" />;

    return (
      <div aria-busy="true" aria-label="Loading the feed">
        {Array.from({ length: 6 }, (_, i) => (
          <div className="post post-skeleton" key={i}>
            <span className="skeleton-avatar" />
            <div className="post-main">
              <span className="skeleton-line is-head" />
              <span className="skeleton-line" />
              <span className="skeleton-line is-short" />
            </div>
          </div>
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
