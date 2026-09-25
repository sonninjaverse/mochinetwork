import { Hono } from "hono";

/**
 * Pins an image to IPFS and hands back its content address.
 *
 * This lives on the indexer because it needs a secret. The web bundle is
 * static and served from a CDN, so a Pinata JWT
 * shipped with it would be public — `NEXT_PUBLIC_` or not, everything in that
 * bundle is readable by anyone who opens it.
 *
 * Only the CID ever reaches the chain. The bytes live on IPFS, the contract
 * stores nothing, and the client resolves `ipfs://` through a gateway.
 */
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export function mediaRoutes() {
  const app = new Hono();

  app.post("/media", async (c) => {
    const jwt = process.env.PINATA_JWT;
    if (!jwt) return c.json({ error: "uploads are not configured" }, 503);

    let form: FormData;
    try {
      form = await c.req.formData();
    } catch {
      return c.json({ error: "invalid upload" }, 400);
    }

    const file = form.get("file");
    if (!(file instanceof File)) return c.json({ error: "choose an image" }, 400);
    // SVG is deliberately not accepted: it is a script container, and these
    // are rendered from a gateway origin we do not control.
    if (!TYPES.has(file.type)) return c.json({ error: "use a PNG, JPEG, WebP or GIF" }, 415);
    if (file.size === 0 || file.size > MAX_BYTES) {
      return c.json({ error: "image must be under 5 MB" }, 413);
    }

    const body = new FormData();
    body.append("file", file, file.name);
    body.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

    let res: Response;
    try {
      res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
        body,
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      return c.json({ error: "could not reach the pinning service" }, 502);
    }

    const payload = (await res.json().catch(() => null)) as { IpfsHash?: string } | null;
    if (!res.ok || !payload?.IpfsHash) {
      return c.json({ error: "upload failed" }, res.status >= 400 ? (res.status as 400) : 502);
    }

    return c.json({ cid: payload.IpfsHash, uri: `ipfs://${payload.IpfsHash}` });
  });

  return app;
}
