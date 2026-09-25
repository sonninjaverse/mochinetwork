"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cleanMetadata, readInlineMetadata, type CommunityMetadata } from "@social/lib/community";
import type { CommunitySummary } from "@social/lib/indexer";
import { resolveMedia } from "@social/lib/media";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** A community's About tab: what it is, who made it, and how big it is. */
export function CommunityAbout({ community }: { community: CommunitySummary }) {
  const [metadata, setMetadata] = useState<CommunityMetadata | null>(null);

  useEffect(() => {
    const uri = community.metadataURI;
    const inline = readInlineMetadata(uri);
    setMetadata(inline);
    if (inline || !/^(https?:\/\/|ipfs:\/\/)/.test(uri)) return;
    const abort = new AbortController();
    void fetch(resolveMedia(uri), { signal: abort.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!abort.signal.aborted) setMetadata(cleanMetadata(data));
      })
      .catch(() => {});
    return () => abort.abort();
  }, [community.metadataURI]);

  return (
    <section className="community-about">
      <h2>About community</h2>
      {metadata?.description && <p className="community-description">{metadata.description}</p>}
      <dl className="community-about-stats">
        <div>
          <dt>Members</dt>
          <dd>{community.memberCount}</dd>
        </div>
        <div>
          <dt>Posts</dt>
          <dd>{community.postCount}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{new Date(community.createdAt * 1000).toLocaleDateString()}</dd>
        </div>
        <div>
          <dt>Created by</dt>
          <dd>
            <Link href={`/${community.creator}/`} title={community.creator}>
              {short(community.creator)}
            </Link>
          </dd>
        </div>
      </dl>
    </section>
  );
}
