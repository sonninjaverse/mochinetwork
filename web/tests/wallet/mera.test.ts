import { beforeEach, describe, expect, it, vi } from "vitest";

const prompts = vi.fn();
const created = vi.fn();
const loaded = vi.fn();

vi.mock("@/lib/wallet/mera-client", () => ({
  createAccount: vi.fn(async () => {
    prompts();
    created();
    return makeSession();
  }),
  loadAccount: vi.fn(async () => {
    prompts();
    loaded();
    if (loadFails) throw new Error("no passkey");
    return makeSession();
  }),
}));

/** Stands in for a browser with no passkey for this relying party. */
let loadFails = false;

function makeSession() {
  return {
    session: { end: vi.fn() },
    account: { address: "0x00000000000000000000000000000000000000A1" },
  };
}

import { createMeraAdapter } from "@/lib/wallet/mera";

describe("mera adapter", () => {
  beforeEach(() => {
    prompts.mockClear();
    created.mockClear();
    loaded.mockClear();
    loadFails = false;
  });

  /**
   * The bug this separation exists for: asking WebAuthn to sign in when there
   * is no passkey opens the credential picker, and on a desktop that is a QR
   * code. A first-time visitor must never be sent down that path.
   */
  describe("createAccount", () => {
    it("never asks to sign in first", async () => {
      await createMeraAdapter().createAccount();

      expect(created).toHaveBeenCalledTimes(1);
      expect(loaded).not.toHaveBeenCalled();
    });

    it("leaves the wallet unlocked and remembered", async () => {
      const w = createMeraAdapter();
      await w.createAccount();

      expect(w.isUnlocked()).toBe(true);
      expect(w.rememberedAddress()).toBe("0x00000000000000000000000000000000000000A1");
    });
  });

  describe("signIn", () => {
    it("never creates a passkey", async () => {
      await createMeraAdapter().signIn();

      expect(loaded).toHaveBeenCalledTimes(1);
      expect(created).not.toHaveBeenCalled();
    });

    /// Falling back to creating would hand someone whose passkey failed a
    /// another account and an empty profile, and call it success.
    it("fails loudly rather than making another account", async () => {
      loadFails = true;
      const w = createMeraAdapter();

      await expect(w.signIn()).rejects.toThrow("no passkey");
      expect(created).not.toHaveBeenCalled();
      expect(w.isUnlocked()).toBe(false);
    });
  });

  /// unlock() is for callers that know an account exists — a write after a
  /// reload — so trying to sign in first is right there.
  it("unlock tries the existing passkey before creating one", async () => {
    loadFails = true;
    const w = createMeraAdapter();

    await w.unlock();

    expect(loaded).toHaveBeenCalledTimes(1);
    expect(created).toHaveBeenCalledTimes(1);
    expect(w.isUnlocked()).toBe(true);
  });

  it("starts locked", () => {
    expect(createMeraAdapter().isUnlocked()).toBe(false);
  });

  /// The property the spike confirmed on hardware: one prompt, then silence.
  it("prompts once and stays unlocked for later calls", async () => {
    const w = createMeraAdapter();
    await w.unlock();
    await w.unlock();
    await w.getAccount();
    expect(prompts).toHaveBeenCalledTimes(1);
    expect(w.isUnlocked()).toBe(true);
  });

  it("ends the session and forgets the account on lock", async () => {
    const w = createMeraAdapter();
    await w.unlock();
    w.lock();
    expect(w.isUnlocked()).toBe(false);
    expect(w.rememberedAddress()).toBeNull();
  });

  /// The cap is absolute: half an hour after unlock the key goes away and the
  /// next signature asks for the passkey again. The address is public, so it
  /// stays for reading.
  it("ends the session on its own after half an hour", async () => {
    vi.useFakeTimers();
    try {
      const w = createMeraAdapter();
      const seen: boolean[] = [];
      w.onLockChange((v) => seen.push(v));
      await w.unlock();
      expect(w.isUnlocked()).toBe(true);

      vi.advanceTimersByTime(30 * 60 * 1000);

      expect(w.isUnlocked()).toBe(false);
      expect(seen).toEqual([true, false]);
      expect(w.rememberedAddress()).toBe("0x00000000000000000000000000000000000000A1");
    } finally {
      vi.useRealTimers();
    }
  });

  /// Storage holds the address so a reload does not send the reader back to a
  /// biometric prompt. It must never hold anything that could sign.
  it("stores the address but nothing that could sign", async () => {
    localStorage.clear();

    const w = createMeraAdapter();
    await w.unlock();

    const values = Object.keys(localStorage).map((k) => localStorage.getItem(k) ?? "");
    expect(values).toContain("0x00000000000000000000000000000000000000A1");
    for (const value of values) {
      expect(value).not.toMatch(/^0x[0-9a-fA-F]{64}$/);
    }
  });

  it("recalls the address after a reload without unlocking", async () => {
    localStorage.clear();

    const first = createMeraAdapter();
    await first.unlock();

    // A fresh adapter is what a reload produces.
    const afterReload = createMeraAdapter();
    expect(afterReload.rememberedAddress()).toBe("0x00000000000000000000000000000000000000A1");
    expect(afterReload.isUnlocked()).toBe(false);
  });

  it("notifies subscribers on unlock and lock", async () => {
    const w = createMeraAdapter();
    const seen: boolean[] = [];
    const off = w.onLockChange((v) => seen.push(v));
    await w.unlock();
    w.lock();
    off();
    expect(seen).toEqual([true, false]);
  });
});
