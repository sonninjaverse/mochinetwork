import { hexToString, stringToHex, type Address } from "viem";
import { publicClient } from "./chain";
import { CONTRACTS, identityRegistryAbi } from "./contracts";
import { getWallet } from "@/lib/wallet";
import { RETIRED_ROUTES } from "@/lib/routes";

/**
 * Usernames.
 *
 * A handle is a bytes32 on chain, so it is at most 31 bytes of ASCII — the
 * limit is the storage word, not a product decision. Restricting the alphabet
 * to lowercase letters, digits and underscore keeps that true and, more
 * importantly, keeps two handles from looking identical: mixed case and
 * lookalike scripts are how impersonation starts on a network where the name
 * is the only thing most people read.
 */
export const HANDLE_PATTERN = /^[a-z0-9_]{3,15}$/;

export const HANDLE_RULES = "3–15 characters: lowercase letters, digits, underscore.";

/**
 * Names the app needs for itself.
 *
 * The root is a namespace of accounts, so a handle and a page of the site
 * compete for the same path: whoever registered `following` would take the
 * tab with them. Short route names — a, p, u — cannot collide, because the
 * pattern already requires three characters.
 *
 * Reserved here rather than on chain. The contract's job is that two people
 * cannot hold one name; which names a particular client cannot render is that
 * client's problem, and another client is free to disagree.
 */
export const RESERVED = new Set([
  ...RETIRED_ROUTES,
  "subs",
  "gate",
  "popular",
  "home",
  "about",
  "docs",
  "api",
  "admin",
  "settings",
  "mochi",
  "static",
  "assets",
  "brand",
  "public",
  "all",
]);

/** The on-chain form. Padded to 32 bytes, which is how the contract stores it. */
export const toHandleBytes = (handle: string) => stringToHex(handle, { size: 32 });

export type HandleCheck =
  | { ok: true }
  | { ok: false; reason: "format" | "reserved" | "taken" | "unreachable" };

/** Whether a handle is free, asked of the contract rather than the indexer. */
export async function checkHandle(handle: string): Promise<HandleCheck> {
  if (!HANDLE_PATTERN.test(handle)) return { ok: false, reason: "format" };
  if (RESERVED.has(handle)) return { ok: false, reason: "reserved" };

  try {
    const owner = (await publicClient.readContract({
      address: CONTRACTS.identityRegistry,
      abi: identityRegistryAbi,
      functionName: "handleOwner",
      args: [toHandleBytes(handle)],
    })) as Address;

    return owner === "0x0000000000000000000000000000000000000000"
      ? { ok: true }
      : { ok: false, reason: "taken" };
  } catch {
    // The transaction itself would still be rejected by the contract, so an
    // unreadable check must not become a refusal to let anyone try.
    return { ok: false, reason: "unreachable" };
  }
}

/** The handle this account already owns, or null. */
export async function handleOf(address: Address): Promise<string | null> {
  try {
    const raw = (await publicClient.readContract({
      address: CONTRACTS.identityRegistry,
      abi: identityRegistryAbi,
      functionName: "handleOf",
      args: [address],
    })) as `0x${string}`;

    // Trailing zero bytes are the padding, not part of the name. Buffer is not
    // a thing in a browser, so this goes through viem rather than Node.
    const text = hexToString(raw).replace(/\0+$/, "");
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

/**
 * Claims a name, once.
 *
 * The contract refuses a second register with AlreadyRegistered, so this is
 * the only name this account will ever have. That is the point: a name that
 * can change hands is a name a shared link can quietly start pointing at
 * someone else.
 */
export async function registerHandle(handle: string): Promise<void> {
  const hash = await getWallet().write({
    address: CONTRACTS.identityRegistry,
    abi: identityRegistryAbi as never,
    functionName: "register",
    // No metadata yet: avatars are derived from the address, and an empty
    // string costs nothing to emit but leaves the field there for later.
    args: [toHandleBytes(handle), ""],
  });

  /**
   * Waited for rather than assumed.
   *
   * write() returns when the RPC accepts the bytes, which is not the same as
   * the transaction being mined — so signing up reported a name claimed at the
   * moment a node agreed to look at it, and anything that happened afterwards
   * happened to nobody. register either reverts or writes the mapping, so a
   * successful receipt is the name.
   */
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 90_000 });
  if (receipt.status !== "success") throw new Error("The chain refused that name.");
}
