import { describe, expect, it } from "vitest";
import { parsePath } from "./route";

const ADDR = "0x774b3b3a8a920c57f79b76fd68004e3b361cd2c5";

describe("parsePath", () => {
  it("reads a bare name as a profile", () => {
    expect(parsePath("/alice/")).toEqual({ kind: "profile", handle: "alice", address: null });
  });

  it("reads a bare address as a profile", () => {
    expect(parsePath(`/${ADDR}`)).toEqual({ kind: "profile", handle: null, address: ADDR });
  });

  it("reads a name and a number as that author's nth post", () => {
    expect(parsePath("/alice/3/")).toEqual({
      kind: "authorPost",
      handle: "alice",
      address: null,
      index: 3,
    });
  });

  it("still reads the chain id", () => {
    expect(parsePath("/p/271/")).toEqual({ kind: "post", id: "271" });
  });

  /// One address per thing: the shapes that shipped before are gone, not
  /// aliased, so nothing resolves two ways.
  it("does not answer to the shapes that were replaced", () => {
    expect(parsePath(`/a/${ADDR}/`).kind).toBe("unknown");
    expect(parsePath("/@alice/3/").kind).toBe("unknown");
  });

  /// The permalink that cannot drift: an address is the account, so this
  /// means the same post however many times its author renames.
  it("reads an address and a number as that account's nth post", () => {
    expect(parsePath(`/${ADDR}/3/`)).toEqual({
      kind: "authorPost",
      handle: null,
      address: ADDR,
      index: 3,
    });
  });

  it("rejects nonsense rather than guessing", () => {
    expect(parsePath("/").kind).toBe("unknown");
    expect(parsePath("/p/notanumber").kind).toBe("unknown");
    expect(parsePath("/alice/notanumber").kind).toBe("unknown");
  });
});

describe("parsePath rejects what cannot be a name", () => {
  it("refuses a segment the registry would never accept", () => {
    expect(parsePath("/ab/").kind).toBe("unknown"); // too short
    expect(parsePath("/Alice/").kind).toBe("unknown"); // uppercase
    expect(parsePath("/hi.there/").kind).toBe("unknown");
    expect(parsePath("/@alice/").kind).toBe("unknown");
  });
});
