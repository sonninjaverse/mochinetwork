import type { WalletAdapter } from "./adapter";
import { createBurnerAdapter } from "./burner";
import { createMeraAdapter } from "./mera";

let instance: WalletAdapter | null = null;

/**
 * One wallet per tab. NEXT_PUBLIC_WALLET=burner forces the fallback, which is
 * how the app keeps working on an authenticator without PRF support — one
 * environment variable, no code change.
 */
export function getWallet(): WalletAdapter {
  if (!instance) {
    instance =
      process.env.NEXT_PUBLIC_WALLET === "burner" ? createBurnerAdapter() : createMeraAdapter();
  }
  return instance;
}

export type { WalletAdapter } from "./adapter";
