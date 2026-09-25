import { describe, expect, it } from "vitest";
import { deriveAccounts } from "../seed/accounts";
import { ANCHOR_COUNT, ANCHOR_OFFSET, ANCHORS } from "../seed/anchors";
import { RING_SIZE, SYBIL_OFFSET } from "../seed/sybil";

const MNEMONIC = "test test test test test test test test test test test junk";

describe("anchors", () => {
  it("has thirty distinct handles that fit in bytes32", () => {
    expect(ANCHOR_COUNT).toBe(30);
    expect(new Set(ANCHORS).size).toBe(30);
    for (const h of ANCHORS) expect(Buffer.from(h, "utf8").length).toBeLessThanOrEqual(32);
  });

  /// Three derivation ranges share one mnemonic. An overlap would hand a ring
  /// wallet depth by accident, which would quietly break the whole defence.
  it("derives into a range disjoint from seed accounts and the ring", () => {
    const seeds = deriveAccounts(MNEMONIC, 200, 0).map((a) => a.address);
    const anchors = deriveAccounts(MNEMONIC, ANCHOR_COUNT, ANCHOR_OFFSET).map((a) => a.address);
    const ring = deriveAccounts(MNEMONIC, RING_SIZE, SYBIL_OFFSET).map((a) => a.address);

    expect(anchors.some((a) => seeds.includes(a))).toBe(false);
    expect(anchors.some((a) => ring.includes(a))).toBe(false);
  });
});
