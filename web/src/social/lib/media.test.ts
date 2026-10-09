import { describe, expect, it } from "vitest";
import { prepareImage, resolveMedia } from "./media";

function file(bytes: number, name: string, type: string): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

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

describe("prepareImage", () => {
  it("leaves an already-small file alone", async () => {
    const small = file(10 * 1024, "small.png", "image/png");
    expect(await prepareImage(small)).toBe(small);
  });

  /// A canvas flattens animation to a still frame, which is not a JPEG of it.
  it("leaves a GIF completely alone", async () => {
    const gif = file(2 * 1024 * 1024, "loop.gif", "image/gif");
    expect(await prepareImage(gif)).toBe(gif);
  });

  /// jsdom (and an old browser) has no createImageBitmap; upload must not
  /// depend on the resize working.
  it("falls back to the original when decoding is unavailable", async () => {
    const big = file(2 * 1024 * 1024, "big.jpg", "image/jpeg");
    expect(await prepareImage(big)).toBe(big);
  });
});
