import type { Address } from "viem";
import type { WalletAdapter, WalletMethod } from "./adapter";
import { createMeraAdapter } from "./mera";
import { createPrivyAdapter } from "./privy";
import {
  forgetAddress,
  forgetMethod,
  recallAddress,
  recallMethod,
  rememberMethod,
} from "./remember";

/**
 * Passkey and Privy side by side.
 *
 * The two adapters are independent wallets; this one remembers which the
 * reader last used and sends every signature to it. The choice is what makes
 * the switch possible without a migration: an address made with a passkey is
 * still opened with a passkey, and a wallet or email account is opened the
 * Privy way, on the same page.
 *
 * No key crosses between them, and locking signs out of both so a shared
 * device cannot leave one behind.
 */
export function createCompositeAdapter(
  mera: WalletAdapter = createMeraAdapter(),
  privy: WalletAdapter = createPrivyAdapter(),
): WalletAdapter {
  // The last method wins on reload. An address with no method recorded
  // predates this choice, and the only accounts that existed then were
  // passkeys, so it is treated as one.
  let active: WalletMethod | null = recallMethod() ?? (recallAddress() ? "passkey" : null);

  const listeners = new Set<(unlocked: boolean) => void>();
  const notify = () =>
    listeners.forEach((cb) => cb(composite.rememberedAddress() !== null));

  const choose = (method: WalletMethod) => {
    active = method;
    rememberMethod(method);
  };

  /** The adapter that signs right now. */
  const target = (): WalletAdapter => {
    if (active === "privy") return privy;
    if (active === "passkey") return mera;
    // Nothing chosen yet: a live Privy session is the only way to be signed in
    // without a prompt, so it wins; otherwise this is a passkey account.
    return privy.isUnlocked() ? privy : mera;
  };

  const composite: WalletAdapter = {
    rememberedAddress: () => target().rememberedAddress(),

    isUnlocked: () => target().isUnlocked(),

    async unlock() {
      choose(privy.isUnlocked() ? "privy" : (active ?? "passkey"));
      await target().unlock();
      notify();
    },

    // The unnamed doors default to the passkey, the original wallet. The
    // combined UI calls the *With variants and names its method instead.
    async createAccount() {
      choose("passkey");
      await mera.createAccount();
      notify();
    },

    async signIn() {
      const method = active ?? "passkey";
      await (method === "privy" ? privy.signIn() : mera.signIn());
      choose(method);
      notify();
    },

    async signInWith(method) {
      await (method === "privy" ? privy.signIn() : mera.signIn());
      choose(method);
      notify();
    },

    async createAccountWith(method) {
      await (method === "privy" ? privy.createAccount() : mera.createAccount());
      choose(method);
      notify();
    },

    async signMessage(message: string) {
      return target().signMessage(message);
    },

    lock() {
      mera.lock();
      privy.lock();
      forgetAddress();
      forgetMethod();
      active = null;
      notify();
    },

    async getAccount(): Promise<Address> {
      return target().getAccount();
    },

    write: (params) => target().write(params),

    send: (params) => target().send(params),

    methods: () => ["passkey", "privy"],

    onLockChange(cb) {
      listeners.add(cb);
      // A restored Privy session with no method remembered means the last
      // sign-in was Privy, from before this choice existed.
      const offPrivy = privy.onLockChange(() => {
        if (!active && privy.isUnlocked()) active = "privy";
        notify();
      });
      const offMera = mera.onLockChange(notify);
      return () => {
        listeners.delete(cb);
        offPrivy();
        offMera();
      };
    },
  };

  return composite;
}
