import { describe, expect, it } from "vitest";
import { permalinkPath, profilePath } from "./permalink";

describe("permalinkPath", () => {
  /// The address, not the name: a handle changes hands, an account does not.
  it("uses the account and the author's own post number", () => {
    expect(permalinkPath({ id: "271", author: "0xabc", authorIndex: 3 })).toBe("/0xabc/3/");
  });

  /// Most accounts have no name, and they still need a link.
  it("falls back to the chain id when the author is unknown", () => {
    expect(permalinkPath({ id: "271", authorIndex: 3 })).toBe("/p/271/");
  });

  /// An index of 0 means the indexer did not supply one; guessing 1 would
  /// point at the wrong post.
  it("falls back when the author index is missing", () => {
    expect(permalinkPath({ id: "271", author: "0xabc" })).toBe("/p/271/");
    expect(permalinkPath({ id: "271", author: "0xabc", authorIndex: 0 })).toBe("/p/271/");
  });
});

describe("profilePath", () => {
  it("uses the name when there is one", () => {
    expect(profilePath({ author: "0xabc", handle: "alice" })).toBe("/alice/");
  });

  it("falls back to the address", () => {
    expect(profilePath({ author: "0xabc", handle: null })).toBe("/0xabc/");
  });
});
