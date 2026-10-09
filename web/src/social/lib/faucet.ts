import type { Address } from "viem";
import { publicClient } from "./chain";
import { CONTRACTS, faucetAbi } from "./contracts";
import { getWallet } from "@/lib/wallet";

/**
 * The tMON faucet, from the client side.
 *
 * The eligibility rule lives in the contract — a wallet has either claimed or
 * it has not — and this only reads it back. The client never decides who is
 * allowed to claim, so a stale page and a fresh one cannot disagree about it.
 */

export const FAUCET = CONTRACTS.faucet;

export function faucetConfigured(): boolean {
  return typeof FAUCET === "string" && /^0x[0-9a-fA-F]{40}$/.test(FAUCET);
}

/** Has this wallet already taken its one claim? */
export async function hasClaimed(address: Address): Promise<boolean> {
  if (!faucetConfigured()) return true;
  return (await publicClient.readContract({
    address: FAUCET as Address,
    abi: faucetAbi,
    functionName: "claimed",
    args: [address],
  })) as boolean;
}

/** What one claim is worth, as the contract defines it. */
export async function claimAmount(): Promise<bigint> {
  if (!faucetConfigured()) return 0n;
  return (await publicClient.readContract({
    address: FAUCET as Address,
    abi: faucetAbi,
    functionName: "CLAIM_AMOUNT",
  })) as bigint;
}

/**
 * Claims, and waits for the transfer to land.
 *
 * Waiting matters here: the point of the button is that the wallet can then do
 * something that costs gas, and it should not be told that is possible before
 * the MON is actually there.
 */
export async function claimTMON(): Promise<void> {
  if (!faucetConfigured()) throw new Error("The faucet is not available yet.");

  const hash = await getWallet().write({
    address: FAUCET as Address,
    abi: faucetAbi as never,
    functionName: "claim",
    args: [],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 90_000 });
  if (receipt.status !== "success") throw new Error("The claim was not confirmed.");
}

/** Everything the error chain says, for matching decoded contract errors. */
function chainText(error: unknown): string {
  let text = "";
  let current: unknown = error;

  for (let depth = 0; current && depth < 8; depth++) {
    if (typeof current !== "object") break;
    const e = current as { message?: string; details?: string; cause?: unknown };
    text += ` ${e.message ?? ""} ${e.details ?? ""}`;
    current = e.cause;
  }

  return text;
}

/**
 * The contract's own refusals, recognised by name.
 *
 * A rejected claim and a network failure need different answers — "already
 * claimed" is final, an RPC hiccup is not — and viem decodes the selector
 * back to `AlreadyClaimed()` several layers down the cause chain.
 */
export function isAlreadyClaimed(error: unknown): boolean {
  return chainText(error).includes("AlreadyClaimed()");
}

export function isFaucetEmpty(error: unknown): boolean {
  return chainText(error).includes("Empty()");
}
