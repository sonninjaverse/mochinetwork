import type { Address, Hash, Hex } from "viem";
import type { SendParams, WalletAdapter, WriteParams } from "./adapter";
import { forgetAddress, recallAddress, rememberAddress } from "./remember";

/**
 * The slice of Privy the app needs, implemented by the React bridge below and
 * registered here.
 *
 * Privy ships as React hooks, but the rest of the app talks to a synchronous
 * singleton — `rememberedAddress()` is read during render, and actions.ts
 * calls `write()` outside React. The bridge is the one place that knows about
 * hooks; this module is the one place that knows about sessions, so neither
 * the app nor the adapter has to.
 */
export type PrivyBridge = {
  address(): Address | null;
  isAuthenticated(): boolean;
  /** Opens the connect-wallet modal and resolves once a wallet is connected. */
  login(): Promise<void>;
  logout(): Promise<void>;
  signMessage(message: string): Promise<Hex>;
  write(params: WriteParams): Promise<Hash>;
  send(params: SendParams): Promise<Hash>;
};

let bridge: PrivyBridge | null = null;
let current: Address | null = null;
const listeners = new Set<(unlocked: boolean) => void>();

const notify = () => listeners.forEach((cb) => cb(current !== null));

/**
 * Called by the bridge when it mounts, whenever the connected wallet changes,
 * and with null on unmount. The address is mirrored into storage so a reload
 * can show the profile before Privy has restored its own session.
 */
export function registerPrivyBridge(next: PrivyBridge | null): void {
  bridge = next;
  const address = next?.address() ?? null;
  const changed = address !== current;
  current = address;
  if (address) rememberAddress(address);
  if (changed) notify();
}

/** Fails loudly rather than signing into nothing before the bridge mounts. */
function requireBridge(): PrivyBridge {
  if (!bridge) throw new Error("The wallet is still loading. Try again in a moment.");
  return bridge;
}

export function createPrivyAdapter(): WalletAdapter {
  const adapter: WalletAdapter = {
    rememberedAddress: () => current ?? recallAddress(),

    isUnlocked: () => current !== null && bridge?.isAuthenticated() === true,

    async unlock() {
      if (adapter.isUnlocked()) return;
      await requireBridge().login();
    },

    // Privy owns both doors: connect an external wallet, or sign in by email
    // and receive an embedded wallet. Either way there is nothing to create
    // here first, so both lead to the same modal.
    async createAccount() {
      await requireBridge().login();
    },

    async signIn() {
      await requireBridge().login();
    },

    async signMessage(message: string) {
      return requireBridge().signMessage(message);
    },

    lock() {
      void bridge?.logout();
      forgetAddress();
      current = null;
      notify();
    },

    async getAccount(): Promise<Address> {
      if (!adapter.isUnlocked()) await adapter.unlock();
      const address = current ?? bridge?.address() ?? null;
      if (!address) throw new Error("No wallet is connected.");
      return address;
    },

    write: (params) => requireBridge().write(params),

    send: (params) => requireBridge().send(params),

    onLockChange(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };

  return adapter;
}
