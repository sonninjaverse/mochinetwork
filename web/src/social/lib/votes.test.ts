import { describe, expect, it } from "vitest";
import { netVotes } from "./votes";

describe("netVotes", () => {
  it("shows the plain total before you vote", () => {
    expect(netVotes(6, 0, null, null)).toBe(6);
  });

  it("adds your vote before the indexer has seen it", () => {
    expect(netVotes(6, 0, "up", null)).toBe(7);
    expect(netVotes(6, 0, "down", null)).toBe(5);
  });

  /**
   * The bug. The feed refetches while the card stays mounted, so the totals
   * arrive already containing your vote. Adding it again read as 8, and a
   * reload — which cleared the local state — dropped it back to 7.
   */
  it("does not count your vote twice once the totals include it", () => {
    expect(netVotes(7, 0, "up", "up")).toBe(7);
    expect(netVotes(6, 1, "down", "down")).toBe(5);
  });

  /// Switching sides moves it by two, from either starting point.
  it("moves by two when you switch sides", () => {
    const before = netVotes(6, 0, "up", null);
    const after = netVotes(6, 0, "down", null);
    expect(before - after).toBe(2);

    const seen = netVotes(7, 0, "up", "up");
    const switched = netVotes(7, 0, "down", "up");
    expect(seen - switched).toBe(2);
  });

  it("handles withdrawing a vote the indexer already knows about", () => {
    expect(netVotes(7, 0, null, "up")).toBe(6);
  });
});
