import { isAddress, type Address } from "viem";

/**
 * Remembers the address of the last account that signed in. **Only the
 * address** — never a key, never a session, never anything that could sign.
 *
 * An address is public: it is in every transaction this account has ever sent.
 * Storing it costs nothing and buys the thing that was actually broken — a
 * reload no longer throws the reader back to a biometric prompt just to read a
 * feed that needs no key at all.
 *
 * The key still lives only in memory for the life of a session, which is the
 * property that made storage dangerous in the first place.
 */
const KEY = "mochi-address";

/**
 * That this browser has made a passkey for the site at least once.
 *
 * Deliberately not cleared on sign-out. Signing out ends a session; it does
 * not delete the passkey, and WebAuthn gives a site no way to ask whether one
 * exists. Without this the returning-visitor case was indistinguishable from
 * a first visit, so the page offered "Create account" and people took it —
 * quietly making another identity every time they came back.
 */
const HAS_PASSKEY = "mochi-has-passkey";

/**
 * Which wallet method the last sign-in used, so a reload knows whether to
 * restore a passkey or a Privy session. The address alone cannot say: both
 * methods share the address key below.
 */
const METHOD = "mochi-wallet-method";

export function rememberMethod(method: "passkey" | "privy"): void {
  try {
    window.localStorage.setItem(METHOD, method);
  } catch {
    /* a private window; the reload just falls back to passkey */
  }
}

export function forgetMethod(): void {
  try {
    window.localStorage.removeItem(METHOD);
  } catch {
    /* nothing to do */
  }
}

export function recallMethod(): "passkey" | "privy" | null {
  try {
    const value = window.localStorage.getItem(METHOD);
    return value === "passkey" || value === "privy" ? value : null;
  } catch {
    return null;
  }
}

export function rememberPasskey(): void {
  try {
    window.localStorage.setItem(HAS_PASSKEY, "1");
  } catch {
    /* a private window; the worst case is offering the wrong button */
  }
}

export function hasPasskeyHere(): boolean {
  try {
    return window.localStorage.getItem(HAS_PASSKEY) === "1";
  } catch {
    return false;
  }
}

export function rememberAddress(address: Address): void {
  try {
    window.localStorage.setItem(KEY, address);
  } catch {
    // Private windows reject writes. Losing the convenience is acceptable;
    // failing to sign in is not.
  }
}

export function forgetAddress(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}

export function recallAddress(): Address | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return value && isAddress(value) ? (value as Address) : null;
  } catch {
    return null;
  }
}
