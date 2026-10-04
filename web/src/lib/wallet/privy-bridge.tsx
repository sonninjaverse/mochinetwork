"use client";

import { useEffect, useRef } from "react";
import type { ConnectedWallet } from "@privy-io/react-auth";
import {
  useActiveWallet,
  useLogin,
  useModalStatus,
  usePrivy,
  useWallets,
} from "@privy-io/react-auth";
import { createWalletClient, custom, type Address, type Hash } from "viem";
import { appChain } from "@/lib/chain/config";
import type { SendParams, WriteParams } from "./adapter";
import { registerPrivyBridge, type PrivyBridge } from "./privy";

/** The connected wallet is on the app's chain when its CAIP-2 id matches. */
const CAIP2 = `eip155:${appChain.id}`;

function ethereumWallet(wallets: ConnectedWallet[]): ConnectedWallet | null {
  return wallets.find((wallet) => wallet.type === "ethereum") ?? null;
}

/**
 * The wallet to sign with: whichever one is active, else the first Ethereum
 * wallet. Embedded wallets from email sign-in show up here like any other.
 */
function selectedWallet(
  active: ConnectedWallet | undefined,
  wallets: ConnectedWallet[],
): ConnectedWallet | null {
  if (active?.type === "ethereum") return active;
  return ethereumWallet(wallets);
}

/**
 * A viem client over the wallet's own provider.
 *
 * The provider is requested after any chain switch, because a provider
 * captured before a switch keeps the old chain id.
 */
async function clientFor(wallet: ConnectedWallet) {
  if (wallet.chainId !== CAIP2) await wallet.switchChain(appChain.id);
  const provider = await wallet.getEthereumProvider();
  return createWalletClient({
    account: wallet.address as Address,
    chain: appChain,
    transport: custom(provider),
  });
}

/**
 * Privy error codes that mean the reader backed out, not that anything broke.
 * Closing the modal is a decision, and answering it in red tells someone
 * their own choice went wrong.
 */
const CANCEL_CODES = new Set([
  "exited_auth_flow",
  "exited_link_flow",
  "exited_update_flow",
  "user_exited_set_password_flow",
  "oauth_user_denied",
]);

function cancelled(): Error {
  return Object.assign(new Error("Sign-in cancelled."), { name: "AbortError" });
}

/**
 * Bridges Privy's hooks to the plain adapter the rest of the app uses.
 *
 * Renders nothing and never calls a hook outside PrivyProvider. The pending
 * promise is what lets the adapter's `signIn()` await a modal the hook opens
 * without returning anything.
 */
export function PrivyWalletBridge() {
  const { ready: authReady, authenticated, logout } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { wallet: activeWallet } = useActiveWallet();
  const { isOpen } = useModalStatus();
  const activeEthereum = activeWallet?.type === "ethereum" ? activeWallet : undefined;
  const wallet = selectedWallet(activeEthereum, wallets);

  const pending = useRef<{
    resolve: () => void;
    reject: (error: unknown) => void;
  } | null>(null);

  const { login } = useLogin({
    onComplete: () => {
      pending.current?.resolve();
      pending.current = null;
    },
    onError: (error) => {
      const code = String(error);
      pending.current?.reject(CANCEL_CODES.has(code) ? cancelled() : new Error(code));
      pending.current = null;
    },
  });

  // A modal that closes without onComplete or onError is still a choice to
  // stop; without this the button waits forever.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !isOpen && pending.current) {
      pending.current.reject(cancelled());
      pending.current = null;
    }
    wasOpen.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    if (!authReady || !walletsReady) return;

    const bridge: PrivyBridge = {
      address: () => (wallet?.address as Address | undefined) ?? null,

      isAuthenticated: () => authenticated,

      login: () =>
        new Promise<void>((resolve, reject) => {
          // Already connected: no modal, no prompt.
          if (authenticated && wallet) {
            resolve();
            return;
          }
          pending.current = { resolve, reject };
          login();
        }),

      logout,

      async signMessage(message) {
        if (!wallet) throw new Error("Connect a wallet first.");
        const client = await clientFor(wallet);
        return client.signMessage({ account: wallet.address as Address, message });
      },

      async write(params: WriteParams): Promise<Hash> {
        if (!wallet) throw new Error("Connect a wallet first.");
        const client = await clientFor(wallet);
        // A single attempt: every retry is another prompt in the wallet, so
        // the passkey adapter's spurious-rejection loop would be hostile here.
        return client.writeContract({
          address: params.address,
          abi: params.abi,
          functionName: params.functionName,
          args: params.args,
          value: params.value,
        } as never);
      },

      async send(params: SendParams): Promise<Hash> {
        if (!wallet) throw new Error("Connect a wallet first.");
        const client = await clientFor(wallet);
        return client.sendTransaction({
          account: wallet.address as Address,
          to: params.to,
          value: params.value,
        } as never);
      },
    };

    registerPrivyBridge(bridge);
    return () => registerPrivyBridge(null);
  }, [authReady, walletsReady, authenticated, wallet, login, logout]);

  return null;
}
