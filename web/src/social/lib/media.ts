import { apiFetch } from "./api";

const INDEXER = process.env.NEXT_PUBLIC_INDEXER_URL;
const GATEWAY = process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? "https://gateway.pinata.cloud/ipfs/";

/**
 * Turns a content address into something an <img> can load.
 *
 * The chain stores `ipfs://<cid>` and nothing else. Which gateway renders it
 * is a client decision, and a bad one can be swapped without touching a single
 * post — that is the point of storing the address rather than a URL.
 */
export function resolveMedia(uri: string): string {
  if (!uri.startsWith("ipfs://")) return uri;
  const path = uri.slice("ipfs://".length).replace(/^ipfs\//, "");
  const base = GATEWAY.endsWith("/") ? GATEWAY : `${GATEWAY}/`;
  return `${base}${path}`;
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** Pins an image and returns its ipfs:// address. Throws with a readable message. */
export async function uploadImage(file: File): Promise<string> {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error("Use a PNG, JPEG, WebP or GIF.");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Image must be under 5 MB.");

  const body = new FormData();
  body.append("file", file);

  const res = await apiFetch(`${INDEXER}/media`, { method: "POST", body });
  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.uri) throw new Error(payload?.error ?? "Upload failed.");
  return payload.uri as string;
}
