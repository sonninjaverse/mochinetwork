"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { Feed } from "@social/components/Feed";
import { FeedControl } from "@social/components/FeedControl";
import { Masthead } from "@social/components/Masthead";
import { PullToRefresh } from "@social/components/PullToRefresh";
import { Sidebar } from "@social/components/Sidebar";
import type { Strategy } from "@social/lib/indexer";
import { getWallet } from "@/lib/wallet";

/**
 * Both tabs, which differ only in which posts are considered and which
 * algorithm slot ranks them.
 *
 * Shared because the two pages had drifted into near-duplicates of each other
 * — the same wallet effect, the same refresh key, the same composer wiring —
 * and a fix to one kept needing to be remembered for the other.
 */
export function TabPage({
  slot,
  source,
  blurb,
}: {
  slot: number;
  source: Strategy;
  /** A line under the tabs. Omitted where the feed explains itself. */
  blurb?: string;
}) {
  const [viewer, setViewer] = useState<Address | null>(null);
  const [algorithm, setAlgorithm] = useState<Address | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  // Resolved when the feed says its next refresh has settled, so the pull
  // indicator and the refresh button spin for the work, not for a timer.
  const waiters = useRef<Array<() => void>>([]);


  // Read before paint, not after: a signed-in reader should never watch the
  // sign-in gate flash on a page that is about to show their feed.
  useLayoutEffect(() => {
    const w = getWallet();
    // The remembered address personalises ranking without a prompt: rank() is
    // a view call, so a feed built for this viewer needs no key at all.
    setViewer(w.rememberedAddress());
    return w.onLockChange(() => setViewer(getWallet().rememberedAddress()));
  }, []);

  const requestRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshToken((t) => t + 1);
    return new Promise<void>((resolve) => waiters.current.push(resolve));
  }, []);

  const settleRefresh = useCallback(() => {
    setRefreshing(false);
    for (const done of waiters.current.splice(0)) done();
  }, []);

  return (
    <main className="shell">
      <Masthead />


      <PullToRefresh onRefresh={requestRefresh}>
        <div className="layout">
          <Sidebar />

          <div className="layout-main">
            {blurb && <p className="tab-blurb">{blurb}</p>}

            <div className="feed-tools">
              <FeedControl
                slot={slot}
                selected={algorithm}
                onSelect={setAlgorithm}
                viewer={viewer}
                onRefresh={requestRefresh}
                refreshing={refreshing}
              />
            </div>

            <Feed
              viewer={viewer}
              slot={slot}
              strategy={source}
              algorithmOverride={algorithm}
              refreshToken={refreshToken}
              onRefreshed={settleRefresh}
            />
          </div>
        </div>
      </PullToRefresh>
    </main>
  );
}
