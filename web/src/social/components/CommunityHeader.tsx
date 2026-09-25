"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { Address } from "viem";
import { cleanMetadata, readInlineMetadata, type CommunityMetadata } from "@social/lib/community";
import type { CommunitySummary } from "@social/lib/indexer";
import { resolveMedia } from "@social/lib/media";
import { JoinButton } from "./JoinButton";

export function CommunityHeader({ community, viewer, compact, onChanged }: {
  community: CommunitySummary; viewer: Address | null; compact?: boolean; onChanged?: () => void;
}) {
  const router = useRouter();
  const [metadata, setMetadata] = useState<CommunityMetadata | null>(null);
  useEffect(() => {
    const uri = community.metadataURI;
    const inline = readInlineMetadata(uri);
    setMetadata(inline);
    if (inline || !/^(https?:\/\/|ipfs:\/\/)/.test(uri)) return;
    const abort = new AbortController();
    void fetch(resolveMedia(uri), { signal: abort.signal }).then(r => r.ok ? r.json() : null)
      .then(data => { if (!abort.signal.aborted) setMetadata(cleanMetadata(data)); }).catch(() => {});
    return () => abort.abort();
  }, [community.metadataURI]);
  // A link only where it goes somewhere: in the directory list. On the
  // community's own page it would point at the page you are already on.
  const title = compact ? (
    <Link href={`/m/${community.name}/`}>m/{community.name}</Link>
  ) : (
    <>m/{community.name}</>
  );
  /**
   * The whole row opens the community, the way a post card opens a post.
   * Anything that is its own control — the Join button, the bell besides it,
   * any link — keeps the click.
   */
  function open(event: ReactMouseEvent<HTMLElement>) {
    if (!compact) return;
    if (event.target instanceof Element && event.target.closest("a, button, input, textarea, select")) return;
    router.push(`/m/${community.name}/`);
  }

  return <section
    className={`community-header${compact ? " is-compact is-openable" : ""}`}
    onClick={open}
  >
    <div className="community-heading">
      {metadata?.icon && <img className="community-icon" src={resolveMedia(metadata.icon)} alt="" />}
      {compact ? <h2>{title}</h2> : <h1>{title}</h1>}
      {/* Only on the community's own page. The directory is for finding one,
          and a Join button there competed with the card being the target. */}
      {viewer && !compact && <JoinButton viewer={viewer} name={community.name} onChanged={onChanged} />}
    </div>
    {metadata?.description && <p className="community-description">{metadata.description}</p>}
    <p className="community-counts">{community.memberCount} {community.memberCount === 1 ? "member" : "members"} · {community.postCount} {community.postCount === 1 ? "post" : "posts"}</p>
  </section>;
}
