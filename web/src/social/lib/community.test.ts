import { describe, expect, it } from "vitest";
import { isValidName, parseTag, stripTag, withCommunity, metadataURI, readInlineMetadata } from "./community";

describe("community text", () => {
  it("accepts exactly the on-chain alphabet and length", () => {
    for (const name of ["abc", "a_1", "abcdefghijklmnopqrstu"]) expect(isValidName(name)).toBe(true);
    for (const name of ["ab", "Monad", "mo.nad", "ab\0cd", "abcdefghijklmnopqrstuv"]) expect(isValidName(name)).toBe(false);
  });
  it("recognizes only the first standalone tag", () => {
    expect(parseTag("m/Monad hi m/other")).toBe("monad");
    expect(parseTag("https://social.example/m/monad")).toBe(null);
    expect(parseTag("m/monad, hi")).toBe(null);
  });
  it("replaces a chosen tag in the actual text and removes only that tag for display", () => {
    expect(withCommunity("m/old hello m/other", "monad")).toBe("m/monad hello m/other");
    expect(withCommunity("hello", "monad")).toBe("m/monad hello");
    expect(withCommunity("m/monad hello", null)).toBe("hello");
    expect(stripTag("m/MONAD hello m/other", "monad")).toBe("hello m/other");
    expect(stripTag("m/unknown hello", "monad")).toBe("m/unknown hello");
  });
  it("keeps description text and rejects unsafe icon schemes", () => {
    expect(readInlineMetadata(metadataURI("A place to talk", "ipfs://icon"))).toEqual({ description: "A place to talk", icon: "ipfs://icon" });
    expect(readInlineMetadata(metadataURI("hello", "javascript:alert(1)"))?.icon).toBe("");
    expect(readInlineMetadata("data:application/json,broken")).toBe(null);
  });
});
