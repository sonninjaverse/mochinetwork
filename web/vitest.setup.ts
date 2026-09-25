import "@testing-library/jest-dom/vitest";
import { beforeEach, vi } from "vitest";

// Unit tests render wallet-aware components without a passkey, so stub the
// shared wallet. Tests drive it through globalThis.__walletMock: `address` is
// who is signed in, `open` stands in for every sign-in prompt, `disconnect`
// for lock, and `write` records transactions. `status`, `chainId` and
// `provider` are left from the extension-wallet days and are ignored.
const walletMock = vi.hoisted(() => {
  const state = {
    address: undefined as string | undefined,
    status: "disconnected" as string,
    chainId: undefined as number | undefined,
    provider: undefined as unknown,
    open: vi.fn(async () => {}),
    disconnect: vi.fn(),
    write: vi.fn(async () => `0x${"ab".repeat(32)}` as `0x${string}`),
    listeners: new Set<(unlocked: boolean) => void>(),
  };
  (globalThis as unknown as { __walletMock: typeof state }).__walletMock = state;
  return state;
});

vi.mock("@/lib/wallet", () => ({
  getWallet: () => ({
    rememberedAddress: () => walletMock.address ?? null,
    isUnlocked: () => Boolean(walletMock.address),
    getAccount: async () => walletMock.address,
    unlock: walletMock.open,
    signIn: walletMock.open,
    createAccount: walletMock.open,
    lock: walletMock.disconnect,
    write: walletMock.write,
    send: vi.fn(),
    onLockChange: (cb: (unlocked: boolean) => void) => {
      walletMock.listeners.add(cb);
      return () => walletMock.listeners.delete(cb);
    },
  }),
}));

beforeEach(() => {
  walletMock.address = undefined;
  walletMock.status = "disconnected";
  walletMock.chainId = undefined;
  walletMock.provider = undefined;
  walletMock.open.mockClear();
  walletMock.disconnect.mockClear();
  walletMock.write.mockClear();
  walletMock.listeners.clear();
});
