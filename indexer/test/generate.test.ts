import { describe, expect, it } from "vitest";
import { assignPosts, buildFollowEdges, buildLikeEdges, makeRandom, type Corpus } from "../seed/generate";

const corpus: Corpus = {
  topics: Array.from({ length: 4 }, (_, t) => ({
    name: `t${t}`,
    posts: Array.from({ length: 8 }, (_, i) => `topic ${t} post ${i}`),
  })),
};

describe("assignPosts", () => {
  it("deals every post exactly once", () => {
    const all = assignPosts(corpus, 16).flatMap((a) => a.posts);
    expect(all).toHaveLength(32);
    expect(new Set(all).size).toBe(32);
  });

  it("keeps each account inside one topic", () => {
    for (const a of assignPosts(corpus, 16)) {
      expect(a.posts.every((p) => p.startsWith(`topic ${a.topic} `))).toBe(true);
    }
  });
});

describe("buildFollowEdges", () => {
  it("is deterministic for the same seed", () => {
    const a = buildFollowEdges(assignPosts(corpus, 16), makeRandom(1));
    const b = buildFollowEdges(assignPosts(corpus, 16), makeRandom(1));
    expect(a).toEqual(b);
  });

  it("never produces a self-follow or a duplicate edge", () => {
    const edges = buildFollowEdges(assignPosts(corpus, 16), makeRandom(7));
    expect(edges.some(([a, b]) => a === b)).toBe(false);
    expect(new Set(edges.map((e) => e.join("-"))).size).toBe(edges.length);
  });

  /// A uniform graph would make FollowFeed and AffinityFeed indistinguishable.
  it("produces a skewed follower distribution", () => {
    const edges = buildFollowEdges(assignPosts(corpus, 16), makeRandom(3));
    const inDegree = new Map<number, number>();
    for (const [, to] of edges) inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
    const counts = [...inDegree.values()].sort((x, y) => y - x);
    expect(counts[0]).toBeGreaterThan(counts[counts.length - 1] * 2);
  });
});

describe("buildLikeEdges", () => {
  it("never likes your own post and never likes twice", () => {
    const assignments = assignPosts(corpus, 16);
    const postAuthor = assignments.flatMap((a) => a.posts.map(() => a.account));
    const edges = buildFollowEdges(assignments, makeRandom(5));
    const likes = buildLikeEdges(postAuthor, edges, makeRandom(5));

    expect(likes.some(([actor, postId]) => postAuthor[postId - 1] === actor)).toBe(false);
    expect(new Set(likes.map((l) => l.join("-"))).size).toBe(likes.length);
  });
});
