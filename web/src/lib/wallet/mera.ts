import { createWalletClient, http, type Address, type Hash } from "viem";
import { appChain } from "@/lib/chain/config";
import type { SendParams, WalletAdapter, WriteParams } from "./adapter";
import { isMempoolRejection } from "./errors";
import { createAccount, loadAccount, type MeraSession } from "./mera-client";
import { forgetAddress, recallAddress, rememberAddress, rememberPasskey } from "./remember";

/// Runs of refusals have lasted longer than twenty seconds, so this waits
/// about a minute before giving up and saying so.
const SEND_ATTEMPTS = 20;
const RETRY_PAUSE_MS = 3000;

/// A gwei, which is what the chain wants. The retries move off it by wei.
const PRIORITY_FEE = 1_000_000_000n;

/// A session is capped at half an hour, counted from unlock rather than
/// extended by each signature. It is not a security boundary — this is all
/// client-side — but an unattended tab should not stay signable until someone
/// closes it, and the passkey is one prompt away when the cap is reached.
const SESSION_TTL_MS = 30 * 60 * 1000;

/**
 * Passkey-backed wallet: no seed phrase, no extension, no custody service.
 *
 * mera hands back an ordinary viem LocalAccount, so this adapter owns session
 * lifecycle and nothing else — there is no signing logic here to get wrong.
 *
 * The session holds the derived key and lives only in this closure. It is never
 * serialised, so a reload ends the session by construction rather than by
 * policy, and the timer below ends it after half an hour for the same reason.
 */
export function createMeraAdapter(): WalletAdapter {
  let current: MeraSession | null = null;
  let expiry: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<(unlocked: boolean) => void>();

  const notify = (unlocked: boolean) => listeners.forEach((cb) => cb(unlocked));

  /**
   * Drops the key and stops the clock, but leaves the remembered address
   * alone. An expiry is not a sign-out: the address is public and keeps the
   * profile readable without a prompt, while signing needs the passkey again.
   */
  const endSession = () => {
    if (expiry) {
      clearTimeout(expiry);
      expiry = null;
    }
    if (current) {
      current.session.end(); // zeroes mera's key copy
      current = null;
    }
  };

  /** Shared tail of every path that ends with a live session. */
  const settle = () => {
    rememberAddress(current!.account.address);
    // Survives sign-out: the session ends, the passkey does not.
    rememberPasskey();
    if (expiry) clearTimeout(expiry);
    expiry = setTimeout(() => {
      endSession();
      notify(false);
    }, SESSION_TTL_MS);
    notify(true);
  };

  /**
   * Signs and sends, retrying a rejection the node should not have made.
   *
   * Monad's public RPC intermittently answers "Signer had insufficient
   * balance" to a transaction whose account holds fifty times the reserve it
   * locks. Sending the same thing again does not help: same nonce and same
   * fees make the same bytes, and the node replays its cached verdict
   * without looking at the balance — ten identical retries were refused ten
   * identical times. Moving the priority fee by a wei makes each attempt a
   * different transaction, and a fresh account that was refused three times
   * was accepted on the fourth.
   *
   * A wei is not a bribe. It is only there to defeat the cache.
   *
   * This is a workaround for someone else's outage and it is not always
   * enough: the refusals arrive in runs, and forty attempts inside twenty
   * seconds have all been turned away from an account holding hundreds of
   * MON. When that happens the caller is told, rather than being handed a
   * hash that means nothing.
   */
  async function submit(
    build: (client: ReturnType<typeof createWalletClient>, attempt: number) => Promise<Hash>,
  ): Promise<Hash> {
    if (!current) await adapter.unlock();
    const client = createWalletClient({
      account: current!.account,
      chain: appChain,
      transport: http(appChain.rpcUrls.default.http[0]),
    });

    let refusal: unknown;

    for (let attempt = 0; attempt < SEND_ATTEMPTS; attempt++) {
      try {
        return await build(client, attempt);
      } catch (error) {
        // Anything else — a revert, a cancelled prompt — is the answer.
        if (!isMempoolRejection(error)) throw error;
        refusal = error;
        // Spaced out, because the refusals come in runs: forty back to back
        // inside twenty seconds have all been refused, and the same account
        // went through later unchanged.
        await new Promise((r) => setTimeout(r, RETRY_PAUSE_MS));
      }
    }

    throw refusal;
  }

  const adapter: WalletAdapter = {
    rememberedAddress: () => current?.account.address ?? recallAddress(),

    isUnlocked: () => current !== null,

    /**
     * Used by actions that need a signature from someone already signed in —
     * posting, voting after a reload. It still falls back to creating, because
     * a remembered address can outlive its passkey, but the sign-in path is
     * tried first and that is correct here: the caller knows an account exists.
     */
    async unlock() {
      if (current) return; // one biometric prompt per session, not per action

      try {
        current = await loadAccount();
      } catch {
        current = await createAccount();
      }
      settle();
    },

    async createAccount(label?: string) {
      if (current) return;
      current = await createAccount(label);
      settle();
    },

    async signIn() {
      if (current) return;
      // Deliberately no fallback to creating. Someone who said they have a
      // passkey and hits a problem needs to hear about it, not to quietly end
      // up with another account and an empty profile.
      current = await loadAccount();
      settle();
    },

    async signMessage(message: string) {
      if (!current) await adapter.signIn();
      return current!.account.signMessage({ message });
    },

    lock() {
      endSession();
      forgetAddress();
      notify(false);
    },

    async getAccount(): Promise<Address> {
      if (!current) await adapter.unlock();
      return current!.account.address;
    },

    /** Contract writes go through the retry loop in `submit`. */
    async write(params: WriteParams): Promise<Hash> {
      return submit((client, attempt) =>
        client.writeContract({
          address: params.address,
          abi: params.abi,
          functionName: params.functionName,
          args: params.args,
          value: params.value,
          // Only the priority fee is set. Monad locks gas_limit x
          // maxFeePerGas up front, so naming a generous ceiling here makes
          // the transaction more expensive to admit, not more likely to be
          // admitted — viem's own estimate is the smaller of the two.
          maxPriorityFeePerGas: PRIORITY_FEE + BigInt(attempt),
        } as never),
      );
    },

    /** Native MON transfers share the same retry loop. */
    async send(params: SendParams): Promise<Hash> {
      return submit((client, attempt) =>
        client.sendTransaction({
          to: params.to,
          value: params.value,
          maxPriorityFeePerGas: PRIORITY_FEE + BigInt(attempt),
        } as never),
      );
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
