import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Address } from "viem";
import type { WalletAdapter } from "@/lib/wallet/adapter";
import { createCompositeAdapter } from "@/lib/wallet/composite";
import { forgetAddress, forgetMethod, recallMethod, rememberAddress } from "@/lib/wallet/remember";

const PASSKEY = "0x00000000000000000000000000000000000000A1" as const;
const PRIVY = "0x00000000000000000000000000000000000000B2" as const;

function fake(addressRef: { current: Address | null }) {
  const listeners = new Set<(unlocked: boolean) => void>();
  const adapter: WalletAdapter = {
    rememberedAddress: () => addressRef.current,
    isUnlocked: () => addressRef.current !== null,
    getAccount: vi.fn(async () => addressRef.current as Address),
    unlock: vi.fn(async () => {}),
    createAccount: vi.fn(async () => {}),
    signIn: vi.fn(async () => {}),
    signMessage: vi.fn(async (): Promise<`0x${string}`> => "0xsigned"),
    lock: vi.fn(),
    write: vi.fn(async (): Promise<`0x${string}`> => `0x${"ab".repeat(32)}`),
    send: vi.fn(async (): Promise<`0x${string}`> => `0x${"cd".repeat(32)}`),
    onLockChange: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
  return { adapter, fire: (unlocked: boolean) => listeners.forEach((cb) => cb(unlocked)) };
}

beforeEach(() => {
  forgetAddress();
  forgetMethod();
});

describe("passkey + privy composite", () => {
  it("offers both methods", () => {
    const w = createCompositeAdapter(fake({ current: null }).adapter, fake({ current: null }).adapter);
    expect(w.methods?.()).toEqual(["passkey", "privy"]);
  });

  it("routes writes to Privy after a Privy sign-in", async () => {
    const mera = fake({ current: null });
    const privy = fake({ current: PRIVY });
    const w = createCompositeAdapter(mera.adapter, privy.adapter);

    await w.signInWith?.("privy");
    await w.write({ address: PRIVY, abi: [], functionName: "ping" });

    expect(privy.adapter.write).toHaveBeenCalledTimes(1);
    expect(mera.adapter.write).not.toHaveBeenCalled();
  });

  it("treats a lone remembered address as a legacy passkey account", async () => {
    // An address recorded before this choice existed belongs to a passkey.
    rememberAddress(PASSKEY);
    const mera = fake({ current: PASSKEY });
    const privy = fake({ current: null });
    const w = createCompositeAdapter(mera.adapter, privy.adapter);

    await w.write({ address: PASSKEY, abi: [], functionName: "ping" });

    expect(mera.adapter.write).toHaveBeenCalledTimes(1);
    expect(privy.adapter.write).not.toHaveBeenCalled();
  });

  it("keeps the Privy method across a reload", async () => {
    const first = fake({ current: PRIVY });
    await createCompositeAdapter(fake({ current: null }).adapter, first.adapter).signInWith?.("privy");
    expect(recallMethod()).toBe("privy");

    const reopenedPrivy = fake({ current: PRIVY });
    const reopened = createCompositeAdapter(fake({ current: null }).adapter, reopenedPrivy.adapter);
    await reopened.write({ address: PRIVY, abi: [], functionName: "ping" });

    expect(reopenedPrivy.adapter.write).toHaveBeenCalledTimes(1);
  });

  it("does not record a method when the sign-in is cancelled", async () => {
    const privy = fake({ current: null });
    privy.adapter.signIn = vi.fn(async () => {
      throw Object.assign(new Error("cancelled"), { name: "AbortError" });
    });
    const w = createCompositeAdapter(fake({ current: null }).adapter, privy.adapter);

    await expect(w.signInWith!("privy")).rejects.toThrow(/cancelled/);
    expect(recallMethod()).toBeNull();
  });

  it("locks both wallets and forgets the method", () => {
    const mera = fake({ current: PASSKEY });
    const privy = fake({ current: PRIVY });
    rememberAddress(PASSKEY);
    const w = createCompositeAdapter(mera.adapter, privy.adapter);

    w.lock();

    expect(mera.adapter.lock).toHaveBeenCalledTimes(1);
    expect(privy.adapter.lock).toHaveBeenCalledTimes(1);
    expect(recallMethod()).toBeNull();
  });

  it("adopts a restored Privy session when no method is stored", async () => {
    const mera = fake({ current: null });
    const privyRef = { current: null as Address | null };
    const privy = fake(privyRef);
    const w = createCompositeAdapter(mera.adapter, privy.adapter);
    const unsubscribe = w.onLockChange(() => {});

    // Privy restores its own session after mount.
    privyRef.current = PRIVY;
    privy.fire(true);

    await w.write({ address: PRIVY, abi: [], functionName: "ping" });

    expect(privy.adapter.write).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
