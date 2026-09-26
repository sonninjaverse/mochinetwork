import { createWalletClient, http, type Address, type Hash } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { appChain } from "@/lib/chain/config";
import type { SendParams, WalletAdapter, WriteParams } from "./adapter";
import { forgetAddress, recallAddress, rememberAddress } from "./remember";

/**
 * Fallback wallet: a key generated in the tab and held only in memory.
 *
 * Worse UX than mera — no cross-device recovery, and the account is gone when
 * the tab closes — but it satisfies the same contract, so the app is unchanged
 * if mera is unavailable. The spike found mera throws PRF_UNAVAILABLE on
 * authenticators without PRF support, which is the case this covers.
 */
export function createBurnerAdapter(): WalletAdapter {
  // Deliberately a module-local variable, never storage: a key in
  // localStorage survives the tab, and so does its exposure to XSS.
  let key: `0x${string}` | null = null;
  const listeners = new Set<(unlocked: boolean) => void>();

  const notify = (unlocked: boolean) => listeners.forEach((cb) => cb(unlocked));

  const adapter: WalletAdapter = {
    rememberedAddress: () => (key ? privateKeyToAccount(key).address : recallAddress()),

    isUnlocked: () => key !== null,

    async unlock() {
      if (!key) {
        key = generatePrivateKey();
        rememberAddress(privateKeyToAccount(key).address);
        notify(true);
      }
    },

    // A burner has no stored credential to distinguish, so both doors lead to
    // the same room. Kept distinct so the fallback satisfies the same contract
    // the UI codes against.
    async createAccount() {
      await adapter.unlock();
    },

    async signIn() {
      await adapter.unlock();
    },

    async signMessage(message: string) {
      if (!key) throw new Error("Sign in before confirming your account.");
      return privateKeyToAccount(key).signMessage({ message });
    },

    lock() {
      if (key) key = null;
      forgetAddress();
      notify(false);
    },

    async getAccount(): Promise<Address> {
      if (!key) await adapter.unlock();
      return privateKeyToAccount(key!).address;
    },

    async write(params: WriteParams): Promise<Hash> {
      if (!key) await adapter.unlock();
      const client = createWalletClient({
        account: privateKeyToAccount(key!),
        chain: appChain,
        transport: http(appChain.rpcUrls.default.http[0]),
      });
      return client.writeContract({
        address: params.address,
        abi: params.abi,
        functionName: params.functionName,
        args: params.args,
        value: params.value,
      } as never);
    },

    async send(params: SendParams): Promise<Hash> {
      if (!key) await adapter.unlock();
      const client = createWalletClient({
        account: privateKeyToAccount(key!),
        chain: appChain,
        transport: http(appChain.rpcUrls.default.http[0]),
      });
      return client.sendTransaction({ to: params.to, value: params.value } as never);
    },

    onLockChange(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };

  return adapter;
}
