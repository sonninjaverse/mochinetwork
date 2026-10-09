import { walletKind } from "@/lib/wallet";
import { hasPasskeyHere } from "@/lib/wallet/remember";

/**
 * Saved posts, kept on this device.
 *
 * Not on chain: a save is a private bookmark, and putting it on chain would
 * both cost a transaction and publish what you read. It is the one thing on a
 * profile that is genuinely local, and it stays local.
 *
 * For passkey accounts the list is also encrypted: the same passkey is asked
 * for a second key under a different PRF namespace, an AES-GCM key that cannot
 * sign anything, and the saved list lives as ciphertext at rest. Unlocking is
 * one prompt, the key stays in memory for the session, and wallets without a
 * passkey keep the plaintext behaviour they always had.
 */

const KEY = "mochi-saved";
const VAULT = "mochi-saved-vault";
const EVENT = "mochi-saved-change";

type Envelope = { v: 2; iv: string; data: string };

/// Set while the vault is open. Memory only: closing the tab locks it again.
let vaultKey: CryptoKey | null = null;
let openIds: string[] | null = null;

function readPlain(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writePlain(ids: string[]) {
  localStorage.setItem(KEY, JSON.stringify(ids));
  window.dispatchEvent(new Event(EVENT));
}

function readEnvelope(): Envelope | null {
  try {
    const value = JSON.parse(localStorage.getItem(VAULT) ?? "null") as Envelope | null;
    return value && value.v === 2 && typeof value.iv === "string" && typeof value.data === "string"
      ? value
      : null;
  } catch {
    return null;
  }
}

function b64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function unb64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Seals the list under the passkey-derived key. Exported for its own test. */
export async function sealVault(key: CryptoKey, ids: string[]): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(ids)),
  );
  return { v: 2, iv: b64(iv), data: b64(new Uint8Array(data)) };
}

/** Opens a sealed list. Throws when the key does not fit, which is a wrong passkey. */
export async function openVault(key: CryptoKey, envelope: Envelope): Promise<string[]> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(envelope.iv) },
    key,
    unb64(envelope.data),
  );
  const value = JSON.parse(new TextDecoder().decode(plain));
  return Array.isArray(value) ? value.filter((id) => typeof id === "string") : [];
}

/// Whether this browser can offer the encrypted path at all.
function canEncrypt(): boolean {
  const kind = walletKind();
  return (kind === "mera" || kind === "both") && hasPasskeyHere();
}

function current(): string[] {
  if (openIds) return openIds;
  // A vault with no key is locked, not empty: revealing the plaintext copy
  // would quietly undo the thing the encryption was for.
  if (readEnvelope() && canEncrypt()) return [];
  return readPlain();
}

export function isSaved(id: string): boolean {
  return current().includes(id);
}

/** Newest save first, which is the order a Saved tab reads in. */
export function savedIds(): string[] {
  return [...current()];
}

/** True when an encrypted list exists and this session has not unlocked it. */
export function savesLocked(): boolean {
  return vaultKey === null && canEncrypt() && readEnvelope() !== null;
}

/**
 * Opens the vault. One passkey prompt, under the non-account namespace.
 *
 * The first unlock also adopts any plaintext saves from before encryption
 * existed: they are sealed and the plaintext copy is removed, so there is
 * never a moment with two sources of truth.
 */
export async function unlockSaves(): Promise<boolean> {
  if (vaultKey && openIds) return true;
  if (!canEncrypt()) return false;

  const { deriveSavesKey } = await import("@/lib/wallet/mera-client");
  const key = await deriveSavesKey();

  const envelope = readEnvelope();
  let ids: string[];
  try {
    ids = envelope ? await openVault(key, envelope) : readPlain();
  } catch {
    // A vault this key cannot open belongs to another passkey. Stay locked
    // rather than pretending it was empty.
    return false;
  }

  openIds = ids;
  vaultKey = key;
  if (!envelope && ids.length > 0) {
    try {
      localStorage.setItem(VAULT, JSON.stringify(await sealVault(key, ids)));
      localStorage.removeItem(KEY);
    } catch {
      // Sealing failed; the plaintext list is still the truth.
    }
  }
  window.dispatchEvent(new Event(EVENT));
  return true;
}

export async function toggleSaved(id: string): Promise<void> {
  // A passkey account saves into the vault, unlocking on first use. A
  // dismissed prompt throws, and nothing is written.
  if (canEncrypt() && !vaultKey) await unlockSaves();

  if (vaultKey) {
    const ids = openIds ?? [];
    openIds = ids.includes(id) ? ids.filter((saved) => saved !== id) : [id, ...ids];
    try {
      localStorage.setItem(VAULT, JSON.stringify(await sealVault(vaultKey, openIds)));
      localStorage.removeItem(KEY);
    } catch {
      // Storage refused; the in-memory list still answers for this session.
    }
    window.dispatchEvent(new Event(EVENT));
    return;
  }

  const ids = readPlain();
  writePlain(ids.includes(id) ? ids.filter((saved) => saved !== id) : [id, ...ids]);
}

export function onSavedChange(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
