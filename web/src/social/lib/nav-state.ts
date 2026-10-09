"use client";

import { useEffect, useRef } from "react";

/**
 * Coming back, instead of starting over.
 *
 * The router restores scroll on back/forward, but the feed comes back empty:
 * its posts are fetched, so at restore time the page is a few hundred pixels
 * tall and the browser has nowhere to put the reader. Remembering what was on
 * screen — and where they had scrolled to — lets a feed mount with its
 * previous contents and its previous position before anything is fetched.
 *
 * Memory first, sessionStorage second. Memory covers back-and-forth within a
 * visit; the storage copy also covers a reload, and costs nothing when absent.
 */

export type FeedSnapshot = {
  items: unknown[];
  shown: number;
};

const MAX_AGE_MS = 30 * 60 * 1000;
/// Only what was mounted is worth keeping. A deep feed can rank hundreds of
/// candidates, and sessionStorage is a few megabytes shared with everything
/// else on the origin.
const MAX_ITEMS = 120;

const feeds = new Map<string, { at: number; snapshot: FeedSnapshot }>();
const scrolls = new Map<string, number>();

const FEED_PREFIX = "mochi-feed:";
const SCROLL_PREFIX = "mochi-scroll:";

function store(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function rememberFeed(key: string, snapshot: FeedSnapshot) {
  if (snapshot.items.length === 0) return;
  const at = Date.now();
  const trimmed: FeedSnapshot = {
    items: snapshot.items.slice(0, MAX_ITEMS),
    shown: Math.min(snapshot.shown, MAX_ITEMS),
  };
  feeds.set(key, { at, snapshot: trimmed });
  try {
    // Feed items carry a bigint score, which JSON.stringify refuses outright.
    // Nothing reads it after the list is rendered, so it is stored as text.
    const json = JSON.stringify({ at, ...trimmed }, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    );
    store()?.setItem(FEED_PREFIX + key, json);
  } catch {
    // A full or refused storage is only a lost shortcut, not a lost feed.
  }
}

export function recallFeed(key: string): FeedSnapshot | null {
  const held = feeds.get(key);
  if (held && Date.now() - held.at < MAX_AGE_MS) return held.snapshot;

  try {
    const raw = store()?.getItem(FEED_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: number } & FeedSnapshot;
    if (typeof parsed?.at !== "number" || Date.now() - parsed.at > MAX_AGE_MS) return null;
    if (!Array.isArray(parsed.items) || parsed.items.length === 0) return null;
    const snapshot = { items: parsed.items, shown: parsed.shown };
    feeds.set(key, { at: parsed.at, snapshot });
    return snapshot;
  } catch {
    return null;
  }
}

export function rememberScroll(key: string, y: number) {
  // Rounded once, so the memory copy and the stored copy cannot disagree.
  const rounded = Math.round(y);
  scrolls.set(key, rounded);
  try {
    store()?.setItem(SCROLL_PREFIX + key, String(rounded));
  } catch {
    // Same as above: the memory copy still carries this visit.
  }
}

export function recallScroll(key: string): number {
  const held = scrolls.get(key);
  if (held !== undefined) return held;
  try {
    const raw = store()?.getItem(SCROLL_PREFIX + key);
    const y = raw ? Number(raw) : 0;
    return Number.isFinite(y) && y > 0 ? y : 0;
  } catch {
    return 0;
  }
}

/**
 * Watches where the reader is, and puts them back once the page can hold them.
 *
 * `ready` is the page saying it has rendered the content the position belongs
 * to. Until then there is nothing to scroll through, so the first attempt
 * lands as soon as that flips — and retries while the page is still growing
 * underneath it (images arriving, more rows mounting) because a position past
 * the current scroll height cannot be reached yet.
 *
 * A real gesture cancels the retries: once the reader has touched the page,
 * moving it on their behalf stops being helpful.
 */
export function useScrollRestore(key: string, ready: boolean) {
  const touched = useRef(false);

  useEffect(() => {
    touched.current = false;
    let frame = 0;
    /**
     * How long programmatic scrolls are ignored for.
     *
     * Two things move the page without the reader: navigating away clamps the
     * scroll to the next page's height (a feed at 2500 becomes 466 on a short
     * post), and coming back lets the router restore a position of its own.
     * Both fire scroll events, and recording those would overwrite the very
     * place the reader left. A click, a history move or a popstate is the
     * signal that the following scroll events are not the reader's.
     *
     * The windows are generous because a slow route change can take a second
     * to commit. That costs nothing: any real gesture — a touch, a wheel, a
     * key, a pointer anywhere — hands the page straight back to the reader.
     */
    let pauseUntil = 0;
    const paused = () => performance.now() < pauseUntil;
    // The page this position belongs to. A listener outlives its route for a
    // moment — until React unmounts it — and in that moment the browser
    // clamps the scroll to the next page's height. Position under a different
    // location is another page's business, so it is not recorded here.
    const path = window.location.pathname;
    const stillHere = () => window.location.pathname === path;

    const save = () => {
      if (stillHere()) rememberScroll(key, window.scrollY);
    };
    const onScroll = () => {
      if (paused() || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!paused()) save();
      });
    };
    // A real gesture hands the page back to the reader: stop ignoring.
    const mark = () => {
      touched.current = true;
      pauseUntil = 0;
    };
    const onLeave = () => {
      pauseUntil = performance.now() + 2500;
    };
    const onHistory = () => {
      pauseUntil = performance.now() + 1500;
    };
    const onHide = () => {
      // Leaving the tab is the last chance to hear about a position; iOS in
      // particular may never fire pagehide.
      if (document.visibilityState === "hidden" && !paused()) save();
    };
    const onPageHide = () => {
      if (!paused()) save();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("touchstart", mark, { passive: true });
    window.addEventListener("pointerdown", mark, { passive: true });
    window.addEventListener("wheel", mark, { passive: true });
    window.addEventListener("keydown", mark);
    document.addEventListener("click", onLeave);
    window.addEventListener("popstate", onHistory);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("touchstart", mark);
      window.removeEventListener("pointerdown", mark);
      window.removeEventListener("wheel", mark);
      window.removeEventListener("keydown", mark);
      document.removeEventListener("click", onLeave);
      window.removeEventListener("popstate", onHistory);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onHide);
      // Deliberately no final save on unmount: by the time an unmounting feed
      // is cleaned up, the browser has already clamped the scroll to the next
      // page's height — recording that would overwrite the place it just left.
    };
  }, [key]);

  useEffect(() => {
    if (!ready) return;
    const target = recallScroll(key);
    if (target <= 0) return;

    let attempts = 0;
    let checks = 0;
    let timer: number | undefined;
    let checkTimer: number | undefined;

    // A position beyond the current scroll height cannot be reached; the page
    // is still growing underneath (images, more rows), so try again shortly.
    const reachable = () =>
      document.documentElement.scrollHeight - window.innerHeight >= target - 2;

    /**
     * The router restores scroll on back/forward too, and can land its own
     * value a frame after ours. Once the page has been put where it belongs,
     * look again for a moment and put it back if something moved it. A real
     * gesture ends this: the reader's scroll wins over any restoration.
     */
    const verify = () => {
      if (touched.current) return;
      if (Math.abs(window.scrollY - target) > 8 && reachable()) window.scrollTo(0, target);
      if (checks++ < 3) checkTimer = window.setTimeout(verify, 400);
    };

    const tryRestore = () => {
      if (touched.current) return;
      if (reachable()) {
        window.scrollTo(0, target);
        verify();
        return;
      }
      if (attempts++ < 8) timer = window.setTimeout(tryRestore, 200);
    };

    const frame = requestAnimationFrame(tryRestore);
    return () => {
      cancelAnimationFrame(frame);
      if (timer !== undefined) window.clearTimeout(timer);
      if (checkTimer !== undefined) window.clearTimeout(checkTimer);
    };
  }, [key, ready]);
}
