/**
 * Saved posts, kept on this device.
 *
 * Not on chain: a save is a private bookmark, and putting it on chain would
 * both cost a transaction and publish what you read. It is the one thing on a
 * Reddit profile that is genuinely local, and localStorage is where it lives.
 */
const KEY = "mochi-saved";
const EVENT = "mochi-saved-change";

function read(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function write(ids: string[]) {
  localStorage.setItem(KEY, JSON.stringify(ids));
  window.dispatchEvent(new Event(EVENT));
}

export function isSaved(id: string): boolean {
  return read().includes(id);
}

/** Newest save first, which is the order a Saved tab reads in. */
export function savedIds(): string[] {
  return read();
}

export function toggleSaved(id: string): void {
  const ids = read();
  write(ids.includes(id) ? ids.filter((saved) => saved !== id) : [id, ...ids]);
}

export function onSavedChange(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
