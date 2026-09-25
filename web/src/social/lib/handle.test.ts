import { describe, expect, it } from "vitest";
import { HANDLE_PATTERN, RESERVED, toHandleBytes } from "./handle";

describe("handle format", () => {
  it("accepts a plain name", () => {
    expect(HANDLE_PATTERN.test("vertexmint")).toBe(true);
    expect(HANDLE_PATTERN.test("a_b_9")).toBe(true);
  });

  it("rejects what would not fit or would not be readable", () => {
    expect(HANDLE_PATTERN.test("ab")).toBe(false); // too short
    expect(HANDLE_PATTERN.test("a".repeat(16))).toBe(false); // too long
    expect(HANDLE_PATTERN.test("Vertex")).toBe(false); // case collides
    expect(HANDLE_PATTERN.test("hi there")).toBe(false);
    expect(HANDLE_PATTERN.test("hi.there")).toBe(false);
    expect(HANDLE_PATTERN.test("")).toBe(false);
  });

  /// bytes32 is the storage word, so 31 bytes is a hard ceiling — the longest
  /// handle the pattern allows has to encode without throwing.
  it("encodes to a padded bytes32", () => {
    const bytes = toHandleBytes("a".repeat(15));
    expect(bytes).toHaveLength(66); // 0x + 64 hex chars
    expect(bytes.endsWith("00")).toBe(true);
  });
});

describe("reserved names", () => {
  it("keeps the app's own pages out of the namespace", () => {
    // The root is a namespace of accounts, so whoever registered one of these
    // would take a tab with them.
    for (const route of ["popular", "subs", "gate"]) {
      expect(RESERVED.has(route)).toBe(true);
    }
    expect(RESERVED.has("docs")).toBe(true);
  });

  it("leaves ordinary names alone", () => {
    expect(RESERVED.has("vertexmint")).toBe(false);
  });

  /// a, p and u are route prefixes but cannot be handles anyway.
  it("does not need to reserve what the pattern already rejects", () => {
    for (const short of ["a", "p", "u"]) expect(HANDLE_PATTERN.test(short)).toBe(false);
  });
});
