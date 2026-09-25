export type Vote = "up" | "down" | null;

const delta = (v: Vote) => (v === "up" ? 1 : v === "down" ? -1 : 0);

/**
 * The number under the arrows.
 *
 * `likeCount` and `dislikeCount` are totals from the indexer, and once it has
 * seen your vote they already contain it. The optimistic adjustment therefore
 * has to be the difference between what you have chosen and what the totals
 * already know about — not your choice added on top, which counted a vote
 * twice for as long as the card stayed mounted and then corrected itself on a
 * reload, so the number appeared to move on its own.
 *
 * Switching sides moves the total by two: your vote is withdrawn from one
 * column and added to the other. That is arithmetic, not a bug, and it is what
 * Reddit does.
 */
export function netVotes(
  likeCount: number,
  dislikeCount: number,
  chosen: Vote,
  known: Vote,
): number {
  return likeCount - dislikeCount + delta(chosen) - delta(known);
}
