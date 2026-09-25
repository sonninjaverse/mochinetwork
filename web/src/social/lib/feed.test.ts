import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted above the file body, so a plain const would not exist
// when the factory runs. vi.hoisted moves the spies up with it.
const { readContract, fetchCandidates, fetchPosts } = vi.hoisted(() => ({
  readContract: vi.fn(),
  fetchCandidates: vi.fn(),
  fetchPosts: vi.fn(),
}));

vi.mock("./chain", () => ({ publicClient: { readContract } }));
vi.mock("./indexer", () => ({ fetchCandidates, fetchPosts }));

import { loadFeed } from "./feed";

const VIEWER = "0x00000000000000000000000000000000000000A1" as const;
const ALGO = "0x00000000000000000000000000000000000000B2" as const;

const post = (id: number, text: string) => ({
  id: String(id),
  author: VIEWER,
  handle: `u${id}`,
  text,
  createdAt: 1000 + id,
  likeCount: 0,
});

describe("loadFeed", () => {
  beforeEach(() => {
    readContract.mockReset();
    fetchCandidates.mockReset();
    fetchPosts.mockReset();
  });

  it("orders by the ranking contract, not by the indexer", async () => {
    fetchCandidates.mockResolvedValue(["1", "2", "3"]);
    fetchPosts.mockResolvedValue([post(1, "a"), post(2, "b"), post(3, "c")]);
    readContract
      .mockResolvedValueOnce(ALGO)
      .mockResolvedValueOnce([[3n, 1n, 2n], [90n, 50n, 10n]]);

    const { items } = await loadFeed(VIEWER, 0, "recent");

    expect(items.map((f) => Number(f.id))).toEqual([3, 1, 2]);
    expect(items[0].text).toBe("c");
    expect(items[0].score).toBe(90n);
  });

  it("drops ids the indexer has no content for", async () => {
    fetchCandidates.mockResolvedValue(["1", "2"]);
    fetchPosts.mockResolvedValue([post(1, "a")]);
    readContract.mockResolvedValueOnce(ALGO).mockResolvedValueOnce([[2n, 1n], [90n, 50n]]);

    expect((await loadFeed(VIEWER, 0, "recent")).items.map((f) => Number(f.id))).toEqual([1]);
  });

  it("returns empty rather than throwing when there are no candidates", async () => {
    fetchCandidates.mockResolvedValue([]);
    fetchPosts.mockResolvedValue([]);
    readContract.mockResolvedValueOnce(ALGO);

    expect((await loadFeed(VIEWER, 0, "recent")).items).toEqual([]);
  });

  /// Algorithms are deployed by strangers. A slow or reverting one must degrade
  /// to an unranked feed, never to a blank page.
  it("falls back to indexer order when ranking fails", async () => {
    fetchCandidates.mockResolvedValue(["1", "2"]);
    fetchPosts.mockResolvedValue([post(1, "a"), post(2, "b")]);
    readContract.mockResolvedValueOnce(ALGO).mockRejectedValueOnce(new Error("reverted"));

    expect((await loadFeed(VIEWER, 0, "recent")).items.map((f) => Number(f.id))).toEqual([1, 2]);
  });

  it("asks the indexer for the chosen source and passes the viewer", async () => {
    fetchCandidates.mockResolvedValue(["1"]);
    fetchPosts.mockResolvedValue([post(1, "a")]);
    readContract.mockResolvedValueOnce(ALGO).mockResolvedValueOnce([[1n], [5n]]);

    await loadFeed(VIEWER, 0, "joined");
    expect(fetchCandidates).toHaveBeenCalledWith("joined", 500, VIEWER);
  });

  /**
   * A source that comes back empty stays empty: it never quietly borrows posts
   * from another one, which is what would make two feeds look the same.
   */
  it("stays empty rather than borrowing posts from another source", async () => {
    fetchCandidates.mockResolvedValue([]);
    fetchPosts.mockResolvedValue([]);
    readContract.mockResolvedValueOnce(ALGO);

    const result = await loadFeed(VIEWER, 0, "joined");

    expect(result.items).toEqual([]);
    expect(fetchCandidates).toHaveBeenCalledTimes(1);
    expect(fetchCandidates).toHaveBeenCalledWith("joined", 500, VIEWER);
  });

  it("asks once for any other source too", async () => {
    fetchCandidates.mockResolvedValue([]);
    fetchPosts.mockResolvedValue([]);
    readContract.mockResolvedValueOnce(ALGO);

    expect((await loadFeed(VIEWER, 1, "trending")).items).toEqual([]);
    expect(fetchCandidates).toHaveBeenCalledTimes(1);
  });

  it("uses an override algorithm without reading the registry", async () => {
    fetchCandidates.mockResolvedValue(["1"]);
    fetchPosts.mockResolvedValue([post(1, "a")]);
    readContract.mockResolvedValueOnce([[1n], [5n]]);

    const { items } = await loadFeed(VIEWER, 0, "recent", ALGO);
    expect(items[0].score).toBe(5n);
    // One call, for rank. algorithmOf was skipped entirely.
    expect(readContract).toHaveBeenCalledTimes(1);
  });
});
