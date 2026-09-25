import { describe, expect, it } from "vitest";
import { resolveMedia } from "./media";

describe("resolveMedia", () => {
  it("sends an ipfs address through the gateway", () => {
    expect(resolveMedia("ipfs://bafyabc")).toBe("https://gateway.pinata.cloud/ipfs/bafyabc");
  });

  /// Some pinning services hand back ipfs://ipfs/<cid>.
  it("tolerates a doubled ipfs prefix", () => {
    expect(resolveMedia("ipfs://ipfs/bafyabc")).toBe("https://gateway.pinata.cloud/ipfs/bafyabc");
  });

  it("leaves anything that is already a url alone", () => {
    expect(resolveMedia("https://example.com/cat.png")).toBe("https://example.com/cat.png");
  });

  it("leaves an empty uri alone, so a post with no image renders nothing", () => {
    expect(resolveMedia("")).toBe("");
  });
});
