/**
 * Plants a visible bot ring in the demo data: wallets that follow only each
 * other and like only each other's posts.
 *
 * Nothing here is special-cased anywhere in the system. The ring is defeated
 * purely by never having been followed by a reachable account, which is the
 * whole argument — having it present lets the demo show that rather than
 * assert it.
 *
 * Derived at a high offset so these wallets can never collide with the real
 * seed accounts.
 */
export const SYBIL_OFFSET = 10_000;
export const RING_SIZE = 100;

/// Only a few members post. Every member likes every one of those posts, which
/// is what produces the striking number on screen: a like count near the ring
/// size next to a weighted count of zero.
export const RING_POSTERS = 5;
export const FOLLOWS_EACH = 10;

export const RING_POSTS = [
  "GM! 100x gem, huge opportunity, link in bio",
  "everyone is sleeping on this. do not miss the next leg up.",
  "just aped in. this is financial advice (it is not).",
  "wake up. the biggest launch of the cycle is happening right now.",
  "last chance before this goes parabolic. dont say i didnt warn you.",
];

/** Ring member i follows the next FOLLOWS_EACH members, wrapping around. */
export function ringFollowEdges(size = RING_SIZE, each = FOLLOWS_EACH): Array<[number, number]> {
  const edges: Array<[number, number]> = [];
  for (let i = 0; i < size; i++) {
    for (let n = 1; n <= each; n++) {
      edges.push([i, (i + n) % size]);
    }
  }
  return edges;
}
