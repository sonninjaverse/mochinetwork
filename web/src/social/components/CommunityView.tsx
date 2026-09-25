"use client";

import type { Address } from "viem";
import Link from "next/link";
import { useEffect, useState } from "react";
import { isValidName } from "@social/lib/community";
import { SLOT_FEED } from "@social/lib/contracts";
import { fetchCommunity, type CommunitySummary } from "@social/lib/indexer";
import { useViewer } from "@social/lib/viewer";
import { CommunityAbout } from "./CommunityAbout";
import { CommunityHeader } from "./CommunityHeader";
import { CommunityNotify } from "./CommunityNotify";
import { CreatePost } from "./CreatePost";
import { Feed } from "./Feed";
import { FeedControl } from "./FeedControl";
import { Masthead } from "./Masthead";
import { Sidebar } from "./Sidebar";

/** One community, with the Posts/About split every subreddit has. */
export function CommunityView() {
  const viewer = useViewer();
  const [community, setCommunity] = useState<CommunitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [algorithm, setAlgorithm] = useState<Address | null>(null);
  const [pending, setPending] = useState<string[]>([]);
  const [tab, setTab] = useState<"posts" | "about">("posts");

  const refresh = () => setRevision((n) => n + 1);

  useEffect(() => {
    let active = true;
    const name = window.location.pathname.split("/").filter(Boolean)[1] ?? "";
    if (!isValidName(name)) {
      setLoading(false);
      return;
    }
    setError(null);
    void fetchCommunity(name, viewer ?? undefined).then(
      (c) => {
        if (active) {
          setCommunity(c);
          setLoading(false);
          document.title = `m/${name} · Mochi`;
        }
      },
      (e) => {
        if (active) {
          setError(e.message);
          setLoading(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [viewer, revision]);

  return (
    <main className="shell">
      <Masthead />
      <div className="layout">
        <Sidebar />
        <div className="layout-main">
          <p className="community-browse">
            <Link href="/m/">All communities</Link>
          </p>

      {loading ? (
        <p className="state">Loading community…</p>
      ) : error ? (
        <p className="state" role="alert">
          {error} <button className="btn btn-sm" onClick={refresh}>Try again</button>
        </p>
      ) : !community ? (
        <p className="state">This community does not exist.</p>
      ) : (
        <>
          <div className="community-banner" aria-hidden />
          <CommunityHeader community={community} viewer={viewer} onChanged={refresh} />

          {/* Below the header, so Join/Leave never moves when this appears. */}
          {viewer && community.joined && (
            <div className="community-bell">
              <CommunityNotify name={community.name} />
            </div>
          )}

          <div className="community-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === "posts"}
              className={tab === "posts" ? "is-on" : ""}
              onClick={() => setTab("posts")}
              data-testid="community-posts"
            >
              Posts
            </button>
            <button
              role="tab"
              aria-selected={tab === "about"}
              className={tab === "about" ? "is-on" : ""}
              onClick={() => setTab("about")}
              data-testid="community-about"
            >
              About
            </button>
          </div>

          {tab === "about" ? (
            <CommunityAbout community={community} />
          ) : (
            <>
              {/* No sign-in prompt here: the masthead carries one on every
                  page, and a second one under the tab strip read as a wall. */}
              <div className="feed-tools">
                <FeedControl
                  slot={SLOT_FEED}
                  selected={algorithm}
                  onSelect={setAlgorithm}
                  viewer={viewer}
                  onRefresh={refresh}
                />
                <CreatePost
                  viewer={viewer}
                  community={community.name}
                  onPosted={(text) => {
                    setPending((p) => [text, ...p]);
                    refresh();
                  }}
                />
              </div>
              <Feed
                key={revision}
                viewer={viewer}
                slot={SLOT_FEED}
                strategy="community"
                community={community.name}
                algorithmOverride={algorithm}
                pending={pending}
              />
            </>
          )}
        </>
      )}
        </div>
      </div>
    </main>
  );
}
