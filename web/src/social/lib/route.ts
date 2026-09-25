/**
 * What a path is addressing.
 *
 * The root is a namespace of accounts, the way x.com/username is, and a second
 * segment is that account's nth post.
 *
 * Both a name and an address work in the first position, and they are not
 * equivalent: an address is the account, while a handle is a label that can
 * change hands. Links meant to last are written with the address, which is
 * what Copy link produces.
 */
export type Target =
  | { kind: "profile"; handle: string | null; address: string | null }
  | { kind: "post"; id: string }
  | { kind: "authorPost"; handle: string | null; address: string | null; index: number }
  | { kind: "unknown" };

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const DIGITS = /^\d+$/;
// The same shape the registry accepts. Checking it here means a path that
// could never be a name is rejected rather than sent to the indexer to fail.
const HANDLE = /^[a-z0-9_]{3,15}$/;

export function parsePath(pathname: string): Target {
  const parts = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  if (parts.length === 0) return { kind: "unknown" };
  if (["m", "subs", "gate", "popular"].includes(parts[0])) return { kind: "unknown" };

  // /p/<id> — the chain's own id, and the address that cannot drift.
  if (parts[0] === "p") {
    return parts[1] && DIGITS.test(parts[1]) ? { kind: "post", id: parts[1] } : { kind: "unknown" };
  }

  const head = parts[0];

  if (ADDRESS.test(head)) {
    if (parts.length === 1) return { kind: "profile", handle: null, address: head };
    return DIGITS.test(parts[1])
      ? { kind: "authorPost", handle: null, address: head, index: Number(parts[1]) }
      : { kind: "unknown" };
  }

  if (!HANDLE.test(head)) return { kind: "unknown" };

  if (parts.length === 1) return { kind: "profile", handle: head, address: null };
  return DIGITS.test(parts[1])
    ? { kind: "authorPost", handle: head, address: null, index: Number(parts[1]) }
    : { kind: "unknown" };
}
