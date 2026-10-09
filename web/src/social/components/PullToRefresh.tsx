"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/// How far the page has to come down before letting go means refresh.
const THRESHOLD = 64;
/// The pull stops here, so a long drag does not drag the feed off screen.
const MAX_PULL = 110;
/// The page follows the finger at half speed, which is what makes it feel
/// elastic rather than broken.
const RESISTANCE = 0.5;

/**
 * Pull down at the top of a page to refresh it.
 *
 * Mobile only, by construction: it listens to touch, and a mouse has a button
 * for this. The gesture is claimed only once it is clearly a downward pull —
 * a tap, a sideway swipe or a scroll from the top all pass through untouched —
 * and while it is claimed the browser's own overscroll is suppressed so the
 * two do not fight over the same pixels.
 *
 * `onRefresh` may return a promise. If it does, the indicator stays until the
 * work is done rather than until the finger is lifted; if it does not, the
 * gesture still reads correctly and simply resets.
 */
export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<void> | void;
  children: ReactNode;
}) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const pull = useRef(0);
  const startY = useRef<number | null>(null);
  const engaged = useRef(false);
  const refreshing = useRef(false);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const refresh = useRef(onRefresh);

  useEffect(() => {
    refresh.current = onRefresh;
  });

  useEffect(() => {
    const node = wrap.current;
    if (!node) return;

    const settle = (value: number) => {
      pull.current = value;
      setOffset(value);
    };

    const run = async () => {
      if (refreshing.current) return;
      refreshing.current = true;
      setBusy(true);
      // Hold the indicator open at the threshold for the duration, so the
      // release reads as committed rather than as a bounce that gave up.
      settle(THRESHOLD);
      try {
        await refresh.current();
      } finally {
        refreshing.current = false;
        setBusy(false);
        settle(0);
      }
    };

    const onStart = (event: TouchEvent) => {
      if (refreshing.current || event.touches.length !== 1) return;
      if (window.scrollY > 0) return;
      startY.current = event.touches[0].clientY;
      engaged.current = false;
    };

    const onMove = (event: TouchEvent) => {
      if (startY.current === null || refreshing.current) return;
      const dy = event.touches[0].clientY - startY.current;

      // Upward: the page scrolls, this is not our gesture.
      if (dy <= 0) {
        if (!engaged.current) startY.current = null;
        return;
      }

      if (!engaged.current) {
        // Ignore the first few pixels, so a tap with a wobble is still a tap.
        if (dy < 10) return;
        // The reader was not at the top after all — the page moved under them.
        if (window.scrollY > 0) {
          startY.current = null;
          return;
        }
        engaged.current = true;
        setDragging(true);
      }

      if (event.cancelable) event.preventDefault();
      settle(Math.min(MAX_PULL, dy * RESISTANCE));
    };

    const onEnd = () => {
      if (startY.current === null) return;
      const pulled = pull.current;
      startY.current = null;
      setDragging(false);
      if (!engaged.current) return;
      engaged.current = false;
      if (pulled >= THRESHOLD) void run();
      else settle(0);
    };

    node.addEventListener("touchstart", onStart, { passive: true });
    node.addEventListener("touchmove", onMove, { passive: false });
    node.addEventListener("touchend", onEnd);
    node.addEventListener("touchcancel", onEnd);
    return () => {
      node.removeEventListener("touchstart", onStart);
      node.removeEventListener("touchmove", onMove);
      node.removeEventListener("touchend", onEnd);
      node.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  const progress = busy ? 1 : Math.min(1, offset / THRESHOLD);
  const open = offset > 0 || busy;

  return (
    <div className="ptr" ref={wrap} data-testid="ptr">
      <div
        className={`ptr-indicator${busy ? " is-busy" : ""}${dragging ? " is-dragging" : ""}`}
        style={{
          opacity: progress,
          transform: `translate(-50%, ${offset - 46}px) rotate(${progress * 270}deg)`,
        }}
        aria-hidden={!open}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* The transform stays attached even at rest, so let-go animates back
          instead of snapping. Nothing here is fixed-position — Modals portal
          to the body — so the containing block it creates costs nothing. */}
      <div
        className={`ptr-content${dragging ? " is-dragging" : ""}`}
        style={{ transform: `translateY(${offset}px)` }}
      >
        {children}
      </div>
    </div>
  );
}
