import type { Address } from "viem";
import { apiFetch } from "./api";
import { publicClient } from "./chain";
import { CONTRACTS, postRegistryAbi } from "./contracts";
import { fetchPosts, type IndexedPost } from "./indexer";

const BASE = process.env.NEXT_PUBLIC_INDEXER_URL;

export type Profile = {
  address: Address;
  handle: string | null;
  /** Top-level submissions, the way a Reddit profile counts Posts. */
  posts: number;
  /** Replies, the way a Reddit profile counts Comments. */
  comments: number;
  /** Unix seconds of their earliest post. Shown as a cake day. Null if none. */
  joined: number | null;
  /** Upvotes minus downvotes across everything they have written. */
  votes: number;
  postKarma: number;
  commentKarma: number;
  following: number;
  followers: number;
};

export type Trust = {
  /** Signed reputation in points, 100 per whole vote. */
  karma: number;
  /** How much one of this account's votes counts, 100 being a whole vote. */
  weight: number;
};

/**
 * Reputation comes from the chain, never from the indexer.
 *
 * A score delivered by a server is a score you have to trust the server for —
 * which is the opposite of the point. These two reads cost nothing and can be
 * checked by anyone against the same contract, and they are the same numbers
 * the ranking contracts vote with.
 */
export async function loadTrust(address: Address): Promise<Trust> {
  const [karma, weight] = await Promise.all([
    publicClient.readContract({
      address: CONTRACTS.postRegistry,
      abi: postRegistryAbi,
      functionName: "karmaOf",
      args: [address],
    }),
    publicClient.readContract({
      address: CONTRACTS.postRegistry,
      abi: postRegistryAbi,
      functionName: "weightOf",
      args: [address],
    }),
  ]);
  return { karma: Number(karma), weight: Number(weight) };
}

export async function loadProfile(
  address: Address,
  /** Whoever is reading, so their own votes render as cast. Not the profile's owner. */
  viewer?: Address | null,
): Promise<{ profile: Profile; posts: IndexedPost[]; comments: IndexedPost[] } | null> {
  try {
    const res = await apiFetch(`${BASE}/profile/${address}?limit=50`);
    if (!res.ok) return null;
    const { profile, ids, commentIds } = await res.json();

    // The indexer returns ids newest first; fetchPosts does not preserve that,
    // so each list is put back in the order it arrived in.
    const ordered = async (raw: string[] | undefined) => {
      const list = raw ?? [];
      const posts = await fetchPosts(list, viewer ?? undefined);
      const order = new Map<string, number>(list.map((id, i) => [id, i]));
      posts.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      return posts;
    };

    const [posts, comments] = await Promise.all([ordered(ids), ordered(commentIds)]);
    return { profile, posts, comments };
  } catch {
    return null;
  }
}

/**
 * Plain-language reading of a vote weight.
 *
 * Second person when it is your own page. Reading "a heavily downvoted
 * account" about yourself is a small thing that makes the whole panel feel
 * like it is describing someone else.
 */
export function describeWeight({ weight }: Trust, isYou = false): string {
  const whose = isYou ? "your" : "their";
  if (weight === 100) return `One whole vote. ${isYou ? "Your" : "Their"} likes count the same as anyone's.`;
  if (weight > 100) {
    return `${(weight / 100).toFixed(2)}× a whole vote. Upvoted posts have earned ${whose} account more say.`;
  }
  return `${(weight / 100).toFixed(2)}× a whole vote. Downvoted posts have cost ${whose} account its say.`;
}
