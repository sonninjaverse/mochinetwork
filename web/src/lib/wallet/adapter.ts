import type { Abi, Address, Hash, Hex } from "viem";

export type WriteParams = {
  address: Address;
  abi: Abi;
  functionName: string;
  /** Optional: a function without arguments needs no args array. */
  args?: readonly unknown[];
  /** Native MON sent with a payable contract call. */
  value?: bigint;
};

/** A native coin transfer — the withdraw direction of the wallet. */
export type SendParams = {
  to: Address;
  value: bigint;
};

/**
 * Everything that signs goes through this contract, and nothing else in the
 * app imports mera or constructs a key.
 *
 * Two implementations satisfy it: mera (passkey, no seed phrase) and a burner
 * wallet fallback. The spike confirmed mera produces an ordinary viem account,
 * so this seam is thinner than planned — it owns session lifecycle, not signing.
 */
export interface WalletAdapter {
  /**
   * The address of the last account to sign in, or null. Never prompts.
   *
   * Reading the feed needs no key — ranking is a view call — so the app should
   * know who it is for without asking anyone to touch a sensor.
   */
  rememberedAddress(): Address | null;

  /** Resolves the current address, prompting to unlock if necessary. */
  getAccount(): Promise<Address>;

  /** True when transactions can be signed without a fresh user prompt. */
  isUnlocked(): boolean;

  /** Prompts the user once, then signs silently until the session ends. */
  unlock(): Promise<void>;

  /**
   * Makes a new account, and says so to the authenticator.
   *
   * Separate from unlock because WebAuthn cannot be asked "do I have one of
   * these?". A sign-in request with no passkey to match opens the full
   * credential picker, which on a desktop means a QR code for scanning with a
   * phone — a first-time visitor is shown a puzzle instead of being offered an
   * account. Which of the two to call is the UI's decision, not a guess.
   */
  createAccount(label?: string): Promise<void>;

  /** Unlocks using a passkey that already exists. Never creates one. */
  signIn(): Promise<void>;

  /** Proves account ownership without sending a transaction. Never creates a key. */
  signMessage(message: string): Promise<Hex>;

  /** Drops the in-memory key and forgets the address. A deliberate sign-out. */
  lock(): void;

  /** Sends a contract write and resolves with the transaction hash. */
  write(params: WriteParams): Promise<Hash>;

  /** Sends native coin and resolves with the transaction hash. */
  send(params: SendParams): Promise<Hash>;

  /** Subscribes to lock state; returns an unsubscribe function. */
  onLockChange(cb: (unlocked: boolean) => void): () => void;
}
