import type { WalletAdapter } from "./adapter";
import { createBurnerAdapter } from "./burner";
import { createCompositeAdapter } from "./composite";
import { createMeraAdapter } from "./mera";
import { createPrivyAdapter } from "./privy";
import { walletKind } from "./privy-config";

let instance: WalletAdapter | null = null;

/**
 * One wallet per tab. NEXT_PUBLIC_WALLET picks it: default passkey, `burner`
 * for tests with disposable funds, `privy` for external wallets and email, or
 * `both` to offer the passkey and Privy together. One environment variable,
 * no code change.
 */
export function getWallet(): WalletAdapter {
  if (!instance) {
    const kind = walletKind();
    instance =
      kind === "burner"
        ? createBurnerAdapter()
        : kind === "privy"
          ? createPrivyAdapter()
          : kind === "both"
            ? createCompositeAdapter()
            : createMeraAdapter();
  }
  return instance;
}

export { walletKind } from "./privy-config";
export type { WalletAdapter, WalletMethod } from "./adapter";
