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

/// Phone cameras and screenshots arrive several times larger than any feed
/// renders them. Longest side, in pixels, kept on upload.
const MAX_DIMENSION = 1600;
/// Lossy re-encode quality. High enough that the difference is not visible
/// against the 480px the feed will actually paint.
const QUALITY = 0.85;
/// Below this there is nothing meaningful to win, and only quality to lose.
const SKIP_BELOW_BYTES = 350 * 1024;

let webpSupport: boolean | null = null;

function canEncodeWebp(): boolean {
  if (webpSupport !== null) return webpSupport;
  const probe = document.createElement("canvas");
  probe.width = 1;
  probe.height = 1;
  webpSupport = probe.toDataURL("image/webp").startsWith("data:image/webp");
  return webpSupport;
}

const EXTENSIONS: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/**
 * Shrinks an image before it goes anywhere.
 *
 * Uploading a 4 MB photo over mobile data is the slowest step between picking
 * a file and seeing a post, and every reader then downloads that 4 MB again.
 * Re-encoding and downscaling on the device — where the pixels and the CPU
 * already are — fixes both ends of that.
 *
 * Deliberately conservative: a GIF is returned untouched (animation would
 * flatten to a still), anything already small is left alone, the result is
 * discarded if re-encoding made it bigger, and any failure falls back to the
 * original. Upload never depends on this working.
 */
export async function prepareImage(file: File): Promise<File> {
  if (file.type === "image/gif") return file;
  if (file.size <= SKIP_BELOW_BYTES) return file;
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > MAX_DIMENSION ? MAX_DIMENSION / longest : 1;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));

    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const type = canEncodeWebp()
      ? "image/webp"
      : file.type === "image/png"
        ? "image/png"
        : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, type === "image/png" ? undefined : QUALITY),
    );

    if (!blob || blob.size >= file.size) return file;
    const name = `${file.name.replace(/\.[^.]+$/, "")}.${EXTENSIONS[type] ?? "img"}`;
    return new File([blob], name, { type });
  } catch {
    // A format the canvas cannot decode keeps its original bytes.
    return file;
  }
}

/** Pins an image and returns its ipfs:// address. Throws with a readable message. */
export async function uploadImage(file: File): Promise<string> {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error("Use a PNG, JPEG, WebP or GIF.");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Image must be under 5 MB.");

  const body = new FormData();
  body.append("file", await prepareImage(file));

  const res = await apiFetch(`${INDEXER}/media`, { method: "POST", body });
  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.uri) throw new Error(payload?.error ?? "Upload failed.");
  return payload.uri as string;
}
