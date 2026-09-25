import type { Address } from "viem";
import { publicClient } from "./chain";
import { algorithmRegistryAbi, CONTRACTS, feedAlgorithmAbi } from "./contracts";
import { fetchCandidates, fetchPosts, type IndexedPost, type Strategy } from "./indexer";

export type FeedItem = IndexedPost & { score: bigint };

export type FeedResult = { items: FeedItem[] };

/// Ranking is a view call, so it costs the user nothing and needs no wallet.
/// It still gets a deadline: algorithms are deployed by strangers, and a slow
/// one must degrade to an unranked feed rather than a blank screen.
const RANK_TIMEOUT_MS = 4000;

export async function loadFeed(
  viewer: Address,
  slot: number,
  strategy: Strategy,
  algorithmOverride?: Address,
  community?: string,
): Promise<FeedResult> {
  const algorithm =
    algorithmOverride ??
    ((await publicClient.readContract({
      address: CONTRACTS.algorithmRegistry,
      abi: algorithmRegistryAbi,
      functionName: "algorithmOf",
      args: [viewer, slot],
    })) as Address);

  /**
   * Only what was asked for.
   *
   * An empty Following used to fall back to the newest posts with a line of
   * explanation. It was meant to spare a first visitor an empty page, and what
   * it actually did was fill the one tab that promises to be only your people
   * with strangers — the tab whose entire job is to be different from Explore,
   * showing Explore's contents with a note apologising for it. A tab that
   * means something has to be allowed to be empty.
   */
  const ids = community === undefined
    ? await fetchCandidates(strategy, 500, viewer)
    : await fetchCandidates(strategy, 500, viewer, community);

  const posts = await fetchPosts(ids, viewer);
  if (posts.length === 0) return { items: [] };

  const byId = new Map(posts.map((p) => [p.id, p]));

  let ordered: bigint[];
  let scores: bigint[];
  try {
    const ranked = (await Promise.race([
      publicClient.readContract({
        address: algorithm,
        abi: feedAlgorithmAbi,
        functionName: "rank",
        args: [viewer, ids.map(BigInt)],
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("rank timed out")), RANK_TIMEOUT_MS),
      ),
    ])) as [bigint[], bigint[]];
    [ordered, scores] = ranked;
  } catch {
    // Unranked beats blank.
    return { items: posts.map((p) => ({ ...p, score: 0n })) };
  }

  const out: FeedItem[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const p = byId.get(ordered[i].toString());
    if (p) out.push({ ...p, score: scores[i] ?? 0n });
  }
  return { items: out };
}
