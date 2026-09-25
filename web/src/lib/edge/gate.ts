/**
 * Verify the optional invite cookie issued by the indexer under GATE_SECRET.
 * The cookie contains an expiry and its HMAC-SHA256 signature.
 */
export const GATE_COOKIE = "mochi_gate";

/** Mirrors MAX_TTL_SECONDS in indexer/src/gate.ts. */
const MAX_TTL_SECONDS = 60 * 60 * 24 * 90;

/** A static asset has a dot in its final path segment. */
export function isFilePath(pathname: string): boolean {
  const last = pathname.slice(pathname.lastIndexOf("/") + 1);
  return last.includes(".");
}

/** The gate page and the assets it needs to render. */
export function gateExempt(pathname: string): boolean {
  if (pathname === "/gate" || pathname.startsWith("/gate/")) return true;
  if (pathname.startsWith("/_next/")) return true;
  return isFilePath(pathname);
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
  return Array.from(mac, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Same length, then every character, so a signature cannot be found a byte at a time. */
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function gateAllows(
  value: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!value) return false;
  const dot = value.lastIndexOf(".");
  if (dot < 1) return false;
  const expiryPart = value.slice(0, dot);
  if (!/^\d{1,12}$/.test(expiryPart)) return false;
  const expiry = Number(expiryPart);
  if (expiry <= nowSeconds || expiry > nowSeconds + MAX_TTL_SECONDS) return false;
  return sameText(value.slice(dot + 1), await hmacHex(secret, expiryPart));
}
