"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { Feed } from "@social/components/Feed";
import { FeedControl } from "@social/components/FeedControl";
import { Masthead } from "@social/components/Masthead";
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
  const [refreshKey, setRefreshKey] = useState(0);


  useEffect(() => {
    const w = getWallet();
    // The remembered address personalises ranking without a prompt: rank() is
    // a view call, so a feed built for this viewer needs no key at all.
    setViewer(w.rememberedAddress());
    return w.onLockChange(() => setViewer(getWallet().rememberedAddress()));
  }, []);

  const bump = () => setRefreshKey((k) => k + 1);

  return (
    <main className="shell">
      <Masthead />


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
              onRefresh={bump}
            />
          </div>

          <Feed
            key={refreshKey}
            viewer={viewer}
            slot={slot}
            strategy={source}
            algorithmOverride={algorithm}
          />
        </div>
      </div>
    </main>
  );
}
