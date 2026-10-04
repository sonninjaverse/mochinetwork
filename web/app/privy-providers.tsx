"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import type { ReactNode } from "react";
import { appChain } from "@/lib/chain/config";
import { PrivyWalletBridge } from "@/lib/wallet/privy-bridge";
import { privyAppId } from "@/lib/wallet/privy-config";

/**
 * The Privy provider and its bridge, split into their own chunk.
 *
 * app/providers.tsx imports this lazily, so the Privy SDK — and the
 * WalletConnect connector it drags in — is only fetched when
 * NEXT_PUBLIC_WALLET=privy. Passkey and burner builds never pay for it.
 *
 * People can connect an external wallet or sign in by email. An embedded
 * wallet is created only for users who arrive without one (email), so an
 * external wallet is never replaced by a Privy key.
 */
export function PrivyProviders({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={privyAppId()}
      config={{
        loginMethods: ["wallet", "email"],
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
          solana: { createOnLogin: "off" },
        },
        defaultChain: appChain,
        supportedChains: [appChain],
        appearance: {
          walletChainType: "ethereum-only",
          loginMessage: "Connect a wallet or sign in with email to use Mochi.",
        },
      }}
    >
      <PrivyWalletBridge />
      {children}
    </PrivyProvider>
  );
}
