import { describe, expect, it } from "vitest";
import { createBurnerAdapter } from "@/lib/wallet/burner";

describe("burner adapter", () => {
  it("starts locked and has no account", () => {
    const w = createBurnerAdapter();
    expect(w.isUnlocked()).toBe(false);
  });

  it("produces a stable address across calls once unlocked", async () => {
    const w = createBurnerAdapter();
    await w.unlock();
    const a = await w.getAccount();
    const b = await w.getAccount();
    expect(a).toBe(b);
    expect(w.isUnlocked()).toBe(true);
  });

  it("forgets the key on lock", async () => {
    const w = createBurnerAdapter();
    await w.unlock();
    w.lock();
    expect(w.isUnlocked()).toBe(false);
  });

  it("notifies subscribers on unlock and stops after unsubscribe", async () => {
    const w = createBurnerAdapter();
    const seen: boolean[] = [];
    const off = w.onLockChange((v) => seen.push(v));
    await w.unlock();
    off();
    w.lock();
    expect(seen).toEqual([true]);
  });
})

describe("remembering", () => {
  /// The whole point of storing anything: a reload should not send the reader
  /// back to a prompt just to read a feed that needs no key.
  it("recalls the address after a reload but not the key", async () => {
    const first = createBurnerAdapter();
    await first.unlock();
    const address = await first.getAccount();

    // A fresh adapter is what a reload produces.
    const afterReload = createBurnerAdapter();
    expect(afterReload.rememberedAddress()).toBe(address);
    expect(afterReload.isUnlocked()).toBe(false);
  });

  it("forgets the address on sign out", async () => {
    const w = createBurnerAdapter();
    await w.unlock();
    w.lock();
    expect(w.rememberedAddress()).toBeNull();
  });

  /// Storage must never hold anything that could sign.
  it("stores nothing that looks like a private key", async () => {
    const w = createBurnerAdapter();
    await w.unlock();

    const stored = Object.keys(localStorage).map((k) => localStorage.getItem(k) ?? "");
    for (const value of stored) {
      expect(value).not.toMatch(/^0x[0-9a-fA-F]{64}$/);
    }
  });
});
