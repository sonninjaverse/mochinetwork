import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDb } from "../src/db";
import { createServer } from "../src/server";

const upload = (file: File | string) => {
  const body = new FormData();
  body.append("file", file as never);
  return new Request("http://localhost/media", { method: "POST", body });
};

const png = (bytes = 64) =>
  new File([new Uint8Array(bytes)], "cat.png", { type: "image/png" });

const app = () => createServer(openDb(":memory:"));

beforeEach(() => {
  process.env.PINATA_JWT = "test-jwt";
  vi.restoreAllMocks();
});

describe("media upload", () => {
  it("returns the content address it pinned", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ IpfsHash: "bafyabc" }), { status: 200 }),
    );

    const body = await (await app().fetch(upload(png()))).json();

    expect(body).toEqual({ cid: "bafyabc", uri: "ipfs://bafyabc" });
  });

  /// SVG is a script container and these render from a gateway origin we do
  /// not control, so it is refused rather than sanitised.
  it("refuses an svg", async () => {
    const svg = new File(["<svg/>"], "x.svg", { type: "image/svg+xml" });
    expect((await app().fetch(upload(svg))).status).toBe(415);
  });

  it("refuses an oversized image", async () => {
    expect((await app().fetch(upload(png(6 * 1024 * 1024)))).status).toBe(413);
  });

  it("refuses an empty one", async () => {
    expect((await app().fetch(upload(png(0)))).status).toBe(413);
  });

  it("refuses a body that is not a file", async () => {
    expect((await app().fetch(upload("not a file"))).status).toBe(400);
  });

  it("says so when no key is configured rather than failing obscurely", async () => {
    delete process.env.PINATA_JWT;
    expect((await app().fetch(upload(png()))).status).toBe(503);
  });

  /// A pinning service that is down must not read as a rejected image.
  it("reports an unreachable pinning service as an upstream failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    expect((await app().fetch(upload(png()))).status).toBe(502);
  });
});
