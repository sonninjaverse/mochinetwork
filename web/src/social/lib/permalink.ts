import { apiFetch } from "./api";
import type { IndexedPost } from "./indexer";

const BASE = process.env.NEXT_PUBLIC_INDEXER_URL;

/**
 * Where a post lives.
 *
 * `/0x…/3` — the author's account, then their own third post. Numbered per
 * author rather than globally, because a global id is a serial number that
 * says how much the whole network has ever written.
 *
 * Written with the address rather than the handle on purpose. A handle can be
 * renamed and the old name is freed for anyone, so a link written with one
 * can resolve to someone else's post tomorrow; an address is the account. The
 * name form still resolves for anyone who types it — it is just not what gets
 * copied.
 *
 * `/p/<id>` is the fallback, and the only way in if all you have is the id
 * the chain assigned.
 */
export function permalinkPath(post: {
  id: string;
  author?: string;
  authorIndex?: number;
}): string {
  if (post.author && post.authorIndex) return `/${post.author}/${post.authorIndex}/`;
  return `/p/${post.id}/`;
}

export function permalink(post: Parameters<typeof permalinkPath>[0]): string {
  return `${window.location.origin}${permalinkPath(post)}`;
}

/** Turns /alice/3 back into a post id. Null when nobody holds that name. */
export async function resolveHandlePost(handle: string, n: number): Promise<string | null> {
  return lookup(`${BASE}/by-handle/${handle}/${n}`);
}

/** Turns /0x…/3 back into a post id. The form that cannot drift. */
export async function resolveAuthorPost(address: string, n: number): Promise<string | null> {
  return lookup(`${BASE}/by-author/${address}/${n}`);
}

async function lookup(url: string): Promise<string | null> {
  try {
    const res = await apiFetch(url);
    if (!res.ok) return null;
    return (await res.json()).id ?? null;
  } catch {
    return null;
  }
}

/** Where an account lives: by name when it has one, by address otherwise. */
export function profilePath(account: { author?: string; address?: string; handle?: string | null }) {
  return `/${account.handle ?? account.author ?? account.address}/`;
}

/** Turns /alice into an address. Null when nobody holds that name. */
export async function resolveHandle(handle: string): Promise<string | null> {
  try {
    const res = await apiFetch(`${BASE}/by-handle/${handle}`);
    if (!res.ok) return null;
    return (await res.json()).address ?? null;
  } catch {
    return null;
  }
}

export type PermalinkTarget = IndexedPost;
