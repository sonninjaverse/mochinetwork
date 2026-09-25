export type Corpus = { topics: { name: string; posts: string[] }[] };

/// Fixed seed so a rerun produces the same network. Debugging a demo against a
/// graph that reshuffles every run is miserable.
export function makeRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export type Assignment = { account: number; topic: number; posts: string[] };

/**
 * Deals every corpus post to exactly one account, with accounts grouped by
 * topic.
 *
 * The clustering is load-bearing rather than decoration: with uniform content
 * and random interaction every algorithm returns roughly the same feed, and the
 * whole premise looks pointless on stage.
 */
export function assignPosts(corpus: Corpus, accountCount: number): Assignment[] {
  const topicCount = corpus.topics.length;
  const perTopic = Math.floor(accountCount / topicCount);
  const out: Assignment[] = [];

  for (let t = 0; t < topicCount; t++) {
    const pool = corpus.topics[t].posts;
    const share = Math.floor(pool.length / perTopic);

    for (let k = 0; k < perTopic; k++) {
      const account = t * perTopic + k;
      const start = k * share;
      const end = k === perTopic - 1 ? pool.length : start + share;
      out.push({ account, topic: t, posts: pool.slice(start, end) });
    }
  }
  return out;
}

/**
 * Preferential attachment inside topic clusters, not a uniform random graph.
 *
 * A uniform graph gives every account a similar follower count, which makes
 * FollowFeed and AffinityFeed produce the same ordering and hides the reason
 * both exist.
 */
export function buildFollowEdges(
  assignments: Assignment[],
  rand: () => number,
  averageOut = 6,
): Array<[number, number]> {
  const count = assignments.length;
  const topicOf = assignments.map((a) => a.topic);
  const inDegree = new Array(count).fill(1);
  const seen = new Set<string>();
  const edges: Array<[number, number]> = [];

  for (let from = 0; from < count; from++) {
    const target = Math.max(1, Math.round(averageOut * (0.5 + rand())));

    for (let n = 0; n < target; n++) {
      // Same-topic accounts are far likelier to connect, which is what puts
      // clusters in the graph for Serendipity to push against.
      const sameTopic = rand() < 0.75;
      let to = Math.floor(rand() * count);

      if (sameTopic) {
        const pool: number[] = [];
        for (let j = 0; j < count; j++) {
          if (j !== from && topicOf[j] === topicOf[from]) pool.push(j);
        }
        if (pool.length > 0) {
          // Weight by existing in-degree so a few accounts become hubs.
          const total = pool.reduce((s, j) => s + inDegree[j], 0);
          let pick = rand() * total;
          for (const j of pool) {
            pick -= inDegree[j];
            if (pick <= 0) {
              to = j;
              break;
            }
          }
        }
      }

      const key = `${from}-${to}`;
      if (to === from || seen.has(key)) continue;
      seen.add(key);
      edges.push([from, to]);
      inDegree[to]++;
    }
  }
  return edges;
}

/**
 * Likes follow the graph, plus a minority that cross cluster boundaries.
 *
 * Those strays are what Discovery has to find. Without them the Explore tab has
 * nothing interesting to surface.
 */
export function buildLikeEdges(
  postAuthor: number[],
  edges: Array<[number, number]>,
  rand: () => number,
  likesPerAccount = 7,
): Array<[number, number]> {
  const following = new Map<number, number[]>();
  for (const [a, b] of edges) {
    if (!following.has(a)) following.set(a, []);
    following.get(a)!.push(b);
  }

  const postsBy = new Map<number, number[]>();
  postAuthor.forEach((author, index) => {
    if (!postsBy.has(author)) postsBy.set(author, []);
    // Post ids are 1-based on chain.
    postsBy.get(author)!.push(index + 1);
  });

  const likes: Array<[number, number]> = [];
  const seen = new Set<string>();

  for (const [actor, followees] of following) {
    for (let n = 0; n < likesPerAccount; n++) {
      const fromFollowed = rand() < 0.8 && followees.length > 0;
      const author = fromFollowed
        ? followees[Math.floor(rand() * followees.length)]
        : Math.floor(rand() * postAuthor.length) % (postsBy.size || 1);

      const theirs = postsBy.get(author);
      if (!theirs || theirs.length === 0) continue;

      const postId = theirs[Math.floor(rand() * theirs.length)];
      const key = `${actor}-${postId}`;
      if (postAuthor[postId - 1] === actor || seen.has(key)) continue;
      seen.add(key);
      likes.push([actor, postId]);
    }
  }
  return likes;
}

/**
 * A minority of votes are negative, and they cluster across topic boundaries.
 *
 * Uniform random dislikes would make every post equally controversial, which
 * is the same as making none of them controversial — Reddit's split sort would
 * have nothing to find. Disagreement in a real network follows the same seams
 * the agreement does, just with the sign flipped.
 */
export function buildDislikeEdges(
  postAuthor: number[],
  topicsOf: number[][],
  edges: Array<[number, number]>,
  rand: () => number,
  perAccount = 3,
): Array<[number, number]> {
  const actors = new Set(edges.map(([a]) => a));
  const postsBy = new Map<number, number[]>();
  postAuthor.forEach((author, index) => {
    if (!postsBy.has(author)) postsBy.set(author, []);
    postsBy.get(author)!.push(index + 1);
  });

  const dislikes: Array<[number, number]> = [];
  const seen = new Set<string>();

  for (const actor of actors) {
    for (let n = 0; n < perAccount; n++) {
      // Four in five land outside the actor's own topic. People argue across
      // the seam far more than within it.
      const crossTopic = rand() < 0.8;
      const pool: number[] = [];
      for (let j = 0; j < topicsOf.length; j++) {
        const differs = topicsOf[j][0] !== topicsOf[actor][0];
        if (j !== actor && differs === crossTopic) pool.push(j);
      }
      if (pool.length === 0) continue;

      const author = pool[Math.floor(rand() * pool.length)];
      const theirs = postsBy.get(author);
      if (!theirs || theirs.length === 0) continue;

      const postId = theirs[Math.floor(rand() * theirs.length)];
      const key = `${actor}-${postId}`;
      if (postAuthor[postId - 1] === actor || seen.has(key)) continue;
      seen.add(key);
      dislikes.push([actor, postId]);
    }
  }
  return dislikes;
}
