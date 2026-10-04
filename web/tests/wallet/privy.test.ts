import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPrivyAdapter, registerPrivyBridge, type PrivyBridge } from "@/lib/wallet/privy";
import { forgetAddress } from "@/lib/wallet/remember";

const ADDRESS = "0x00000000000000000000000000000000000000A1" as const;

function fakeBridge(overrides: Partial<PrivyBridge> = {}): PrivyBridge {
  return {
    address: () => null,
    isAuthenticated: () => false,
    login: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
    signMessage: vi.fn(async (): Promise<`0x${string}`> => "0xsigned"),
    write: vi.fn(async (): Promise<`0x${string}`> => `0x${"ab".repeat(32)}`),
    send: vi.fn(async (): Promise<`0x${string}`> => `0x${"cd".repeat(32)}`),
    ...overrides,
  };
}

beforeEach(() => {
  registerPrivyBridge(null);
  forgetAddress();
});

// An external wallet has no separate account to create: connecting it is the
// whole flow, so both doors must lead to the connect modal.
describe("privy adapter", () => {
  it("uses login for both sign-up and sign-in", async () => {
    const login = vi.fn(async () => {});
    registerPrivyBridge(fakeBridge({ login, address: () => ADDRESS, isAuthenticated: () => true }));

    const wallet = createPrivyAdapter();
    await wallet.createAccount();
    await wallet.signIn();

    expect(login).toHaveBeenCalledTimes(2);
  });

  it("remembers the connected address without a prompt", () => {
    registerPrivyBridge(fakeBridge({ address: () => ADDRESS, isAuthenticated: () => true }));

    expect(createPrivyAdapter().rememberedAddress()).toBe(ADDRESS);
    expect(createPrivyAdapter().isUnlocked()).toBe(true);
  });

  it("unlocks by opening the connect modal", async () => {
    const login = vi.fn(async () => {});
    registerPrivyBridge(fakeBridge({ login }));

    await createPrivyAdapter().unlock();

    expect(login).toHaveBeenCalledTimes(1);
  });

  it("signs out through the bridge and forgets the address", async () => {
    const logout = vi.fn(async () => {});
    registerPrivyBridge(fakeBridge({ logout, address: () => ADDRESS, isAuthenticated: () => true }));

    const wallet = createPrivyAdapter();
    wallet.lock();

    expect(logout).toHaveBeenCalledTimes(1);
    expect(wallet.rememberedAddress()).toBeNull();
  });

  it("delegates writes and sends to the bridge", async () => {
    const write = vi.fn(async (): Promise<`0x${string}`> => `0x${"ab".repeat(32)}`);
    const send = vi.fn(async (): Promise<`0x${string}`> => `0x${"cd".repeat(32)}`);
    registerPrivyBridge(fakeBridge({ write, send, address: () => ADDRESS, isAuthenticated: () => true }));

    const wallet = createPrivyAdapter();
    await wallet.write({ address: ADDRESS, abi: [], functionName: "ping" });
    await wallet.send({ to: ADDRESS, value: 1n });

    expect(write).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("says the wallet is not ready before the bridge mounts", async () => {
    await expect(createPrivyAdapter().signIn()).rejects.toThrow(/still loading/i);
  });
});
