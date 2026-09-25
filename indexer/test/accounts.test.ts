import { describe, expect, it } from "vitest";
import { deriveAccounts } from "../seed/accounts";

const MNEMONIC = "test test test test test test test test test test test junk";

describe("deriveAccounts", () => {
  it("is deterministic for the same mnemonic and index", () => {
    const a = deriveAccounts(MNEMONIC, 3);
    const b = deriveAccounts(MNEMONIC, 3);
    expect(a.map((x) => x.address)).toEqual(b.map((x) => x.address));
  });

  it("produces distinct addresses", () => {
    expect(new Set(deriveAccounts(MNEMONIC, 10).map((a) => a.address)).size).toBe(10);
  });

  /// The sybil ring derives at a high offset so it can never collide with the
  /// real seed accounts.
  it("offsets into a disjoint range", () => {
    const first = deriveAccounts(MNEMONIC, 5, 0).map((a) => a.address);
    const later = deriveAccounts(MNEMONIC, 5, 10_000).map((a) => a.address);
    expect(first.some((a) => later.includes(a))).toBe(false);
  });
});
