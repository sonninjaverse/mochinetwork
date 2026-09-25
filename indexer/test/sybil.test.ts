import { describe, expect, it } from "vitest";
import { deriveAccounts } from "../seed/accounts";
import { ringFollowEdges, RING_SIZE, SYBIL_OFFSET } from "../seed/sybil";

const MNEMONIC = "test test test test test test test test test test test junk";

describe("sybil ring", () => {
  it("never self-follows and never repeats an edge", () => {
    const edges = ringFollowEdges();
    expect(edges.some(([a, b]) => a === b)).toBe(false);
    expect(new Set(edges.map((e) => e.join("-"))).size).toBe(edges.length);
  });

  it("gives every member the same in-degree, which is what a ring looks like", () => {
    const inDegree = new Map<number, number>();
    for (const [, to] of ringFollowEdges()) inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
    expect(new Set(inDegree.values()).size).toBe(1);
    expect(inDegree.size).toBe(RING_SIZE);
  });

  /// The offset is the only thing stopping a ring wallet from colliding with a
  /// real seed account, which would hand it depth by accident.
  it("derives into a range disjoint from the seed accounts", () => {
    const real = deriveAccounts(MNEMONIC, 200, 0).map((a) => a.address);
    const ring = deriveAccounts(MNEMONIC, RING_SIZE, SYBIL_OFFSET).map((a) => a.address);
    expect(ring.some((a) => real.includes(a))).toBe(false);
  });
});
