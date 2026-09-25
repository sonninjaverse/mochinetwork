import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { getPasskeyPrfOutput } from "@category-labs/mera";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import type { LocalAccount } from "viem";

/**
 * The only file in the app that touches mera. Keeping it here is what lets the
 * adapter above be unit-tested without WebAuthn.
 *
 * Uses the deterministic PRF path rather than mera's encrypted vault: the
 * passkey's PRF output becomes BIP-39 entropy and derives an EVM key, so
 * nothing is stored and the same passkey reproduces the same address on any
 * device. The vault path would require carrying ciphertext everywhere, and
 * losing it would lose the account even though the passkey survived.
 */

/// Both of these are effectively part of the key derivation. Changing either
/// silently produces a different account for every existing user, so they are
/// fixed here and must never change after launch.
export const PRF_SALT = new Uint8Array(32).fill(7);
const RP_NAME = "Mochi Network";

/**
 * Set NEXT_PUBLIC_RP_ID to a stable parent host when serving multiple
 * subdomains. Independent deployments default to their own hostname.
 * Passkeys remain scoped to the relying party that created them.
 */
export function rpId(): string {
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return host;
  return process.env.NEXT_PUBLIC_RP_ID?.trim() || host;
}

/// PRF output -> BIP-39 entropy -> seed -> EVM key at the standard path.
export function sessionFromPrf(prfOutput: Uint8Array): Secp256k1SigningSession {
  const mnemonic = entropyToMnemonic(prfOutput, wordlist);
  const seed = mnemonicToSeedSync(mnemonic);
  const node = HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'/0/0");
  if (!node.privateKey) throw new Error("derivation produced no private key");
  return createSecp256k1SigningSession({ privateKey: node.privateKey });
}

export type MeraSession = {
  session: Secp256k1SigningSession;
  account: LocalAccount;
};

/**
 * Creates a new passkey. One prompt, or two on authenticators without
 * create-time PRF.
 *
 * `label` is what the browser's passkey picker shows. Every account used to be
 * called "mochi", so anyone with more than one was choosing between identical
 * rows with no way to tell them apart. It is a display name only — the key
 * comes from the PRF output and a fixed salt, and nothing here touches that.
 */
export async function createAccount(label?: string): Promise<MeraSession> {
  const name = label ?? "mochi";
  const { prfOutput } = await createPasskeyWithPrfOutput({
    rp: { id: rpId(), name: RP_NAME },
    user: { name, displayName: name },
    prfSalt: PRF_SALT,
  });
  const session = sessionFromPrf(prfOutput);
  return { session, account: toViemAccount(session) };
}

/**
 * Loads the account behind an existing passkey. One prompt.
 *
 * No credential id is passed, so WebAuthn offers any discoverable credential
 * for this relying party. That is what makes a device with no local state work.
 */
export async function loadAccount(): Promise<MeraSession> {
  const { prfOutput } = await getPasskeyPrfOutput({
    rpId: rpId(),
    prfSalt: PRF_SALT,
  });
  const session = sessionFromPrf(prfOutput);
  return { session, account: toViemAccount(session) };
}
