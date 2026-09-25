import type { Address } from "viem";
import { apiFetch } from "./api";

const BASE = process.env.NEXT_PUBLIC_INDEXER_URL;

export type IndexedPost = {
  id: string;
  author: Address;
  handle: string | null;
  text: string;
  createdAt: number;
  likeCount: number;
  dislikeCount: number;
  authorKarma: number;
  community?: string;
  /** How this viewer has already voted, as the indexer sees it. */
  viewerVote?: "up" | "down" | null;
  /** 1 when this viewer already follows the author. Null with no viewer. */
  viewerFollows?: number | null;
  /** "" when the post has no image. A content address, not a URL. */
  mediaURI?: string;
  /** "0" for a top-level post, else the post this replies to. */
  parentId?: string;
  replyCount?: number;
  /** 1-based position among this author's posts, for a readable permalink. */
  authorIndex?: number;
};

/**
 * Candidate sources, the first stage of the pipeline.
 *
 * X splits this into Thunder (in-network), Phoenix (embeddings) and SimClusters
 * (similarity) and runs them in parallel. The same shape at a smaller scale:
 * what is new, what is spreading, and what the people you follow are saying are
 * three different questions, and the ranker's job changes with the answer.
 *
 * This is also the one stage that is not on chain, which is why it is named on
 * screen rather than hidden.
 */
export type Strategy = "recent" | "popular" | "trending" | "community" | "joined";

export const STRATEGY_LABELS: Record<Strategy, string> = {
  recent: "newest posts",
  popular: "from communities",
  trending: "spreading fastest",
  community: "from this community",
  joined: "from communities you joined",
};

export async function fetchCandidates(
  strategy: Strategy,
  limit = 500,
  viewer?: Address,
  community?: string,
): Promise<string[]> {
  try {
    const params = new URLSearchParams({ strategy, limit: String(limit) });
    if (viewer) params.set("viewer", viewer);
    if (community) params.set("community", community);
    const res = await apiFetch(`${BASE}/candidates?${params}`);
    if (!res.ok) return [];
    const { ids } = await res.json();
    return ids ?? [];
  } catch {
    // The indexer being down is a degraded feed, not a broken page.
    return [];
  }
}

export type CommunitySummary = {
  name: string;
  creator: Address;
  metadataURI: string;
  createdAt: number;
  memberCount: number;
  postCount: number;
  joined: boolean;
};

export async function fetchCommunities(viewer?: Address, q = "", offset = 0): Promise<CommunitySummary[]> {
  const params = new URLSearchParams({ q, offset: String(offset) });
  if (viewer) params.set("viewer", viewer);
  const res = await apiFetch(`${BASE}/communities?${params}`);
  if (!res.ok) throw new Error("Could not load communities. Please try again.");
  return (await res.json()).communities;
}

export async function fetchCommunity(name: string, viewer?: Address): Promise<CommunitySummary | null> {
  const res = await apiFetch(`${BASE}/communities/${encodeURIComponent(name)}${viewer ? `?viewer=${viewer}` : ""}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Could not load this community. Please try again.");
  return (await res.json()).community;
}

/** Ids of the replies to one post, oldest first. */
export async function fetchReplies(id: string): Promise<string[]> {
  try {
    const res = await apiFetch(`${BASE}/replies/${id}`);
    if (!res.ok) return [];
    return (await res.json()).ids ?? [];
  } catch {
    return [];
  }
}

/** Every descendant of one post, flattened. The client rebuilds the tree. */
export async function fetchThread(id: string): Promise<string[]> {
  try {
    const res = await apiFetch(`${BASE}/thread/${id}`);
    if (!res.ok) return [];
    return (await res.json()).ids ?? [];
  } catch {
    return [];
  }
}

export async function fetchPosts(ids: string[], viewer?: string): Promise<IndexedPost[]> {
  if (ids.length === 0) return [];
  try {
    // The viewer is sent so each post can say how this account already voted.
    // Without it the client double-counts a vote the indexer has since seen.
    const who = viewer ? `&viewer=${viewer}` : "";
    const res = await apiFetch(`${BASE}/posts?ids=${ids.join(",")}${who}`);
    if (!res.ok) return [];
    const { posts } = await res.json();
    return posts ?? [];
  } catch {
    return [];
  }
}
