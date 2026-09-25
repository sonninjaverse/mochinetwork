import { apiFetch } from "./api";

const BASE = process.env.NEXT_PUBLIC_INDEXER_URL;
const SEEN_KEY = "mochi-notifications-seen";

export type Notification = {
  kind: "reply" | "like" | "dislike";
  actor: string;
  actorHandle: string | null;
  postId: string | null;
  replyId: string | null;
  text: string | null;
  block: number;
  /** The vote's weight on like/dislike; null on a reply. */
  weight: number | null;
};

export async function fetchNotifications(address: string): Promise<Notification[]> {
  try {
    const res = await apiFetch(`${BASE}/notifications/${address}`);
    if (!res.ok) return [];
    return (await res.json()).notifications ?? [];
  } catch {
    return [];
  }
}

export type CommunityActivity = {
  id: string;
  community: string;
  author: string;
  handle: string | null;
  text: string;
  block: number;
  createdAt: number;
  /** Weighted likes, on the same 100-point scale karma uses. */
  weightedLikes: number;
};

/**
 * Recent posts in the communities a reader watches, after a block.
 *
 * The preference — off, only posts that earned a vote, or every post — is the
 * client's; the indexer just returns what landed.
 */
export async function fetchActivity(
  communities: string[],
  since: number,
): Promise<CommunityActivity[]> {
  if (communities.length === 0) return [];
  try {
    const params = new URLSearchParams({ communities: communities.join(","), since: String(since) });
    const res = await apiFetch(`${BASE}/activity?${params}`);
    if (!res.ok) return [];
    return (await res.json()).activity ?? [];
  } catch {
    return [];
  }
}

/**
 * How far this reader has caught up, kept on their own device.
 *
 * Not on the server: marking someone else's notifications read would need no
 * more than their address, which is public. A per-device marker is worth less
 * and costs nothing to be wrong about.
 */
export function lastSeenBlock(): number {
  try {
    return Number(window.localStorage.getItem(SEEN_KEY) ?? 0);
  } catch {
    return 0;
  }
}

export function markSeen(block: number): void {
  try {
    window.localStorage.setItem(SEEN_KEY, String(block));
  } catch {
    // A private window. Everything stays unread, which is the safe way to be
    // wrong: it shows too much rather than hiding something.
  }
}

export const unreadCount = (items: Notification[], seen: number) =>
  items.filter((n) => n.block > seen).length;

/**
 * Roughly how long ago, from block height.
 *
 * Only a post carries a timestamp on chain — the contract emits one because a
 * post's age is ranked on, and nothing ranks on the age of a like. Ordering
 * comes from the block number and is exact; this is only the clock, and a list
 * nobody reads for seconds can afford an estimate.
 */
const BLOCK_MS = 400;

export function agoFromBlock(block: number, head: number): string {
  const seconds = Math.max(0, Math.round(((head - block) * BLOCK_MS) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}
