import { isAddress, parseEther } from "viem";

/**
 * A plain MON transfer costs 21000 gas. Nothing here calls a contract, so the
 * reserve is that number times the gas price and nothing more.
 */
export const TRANSFER_GAS = 21_000n;

/** The most that can be sent while leaving gas behind. Null until gas is known. */
export function maxSendable(balance: bigint, gasPrice: bigint | null): bigint | null {
  if (gasPrice === null) return null;
  const reserved = TRANSFER_GAS * gasPrice;
  return balance > reserved ? balance - reserved : 0n;
}

export type WithdrawDraft = {
  /** The recipient, as typed. */
  to: string;
  /** The amount, as typed, in MON. */
  amount: string;
  /** This account, so sending to yourself is caught. */
  self?: string;
  balance: bigint;
  /** Null while the gas price has not been read yet. */
  gasPrice: bigint | null;
};

export type WithdrawError =
  | "no-address"
  | "bad-address"
  | "self"
  | "no-amount"
  | "bad-amount"
  | "no-gas"
  | "too-much";

/** Null when the draft can be sent. Pure, so the modal has one rule to render. */
export function withdrawError(draft: WithdrawDraft): WithdrawError | null {
  const to = draft.to.trim();
  if (!to) return "no-address";
  if (!isAddress(to)) return "bad-address";
  if (draft.self && to.toLowerCase() === draft.self.toLowerCase()) return "self";

  const amount = draft.amount.trim();
  if (!amount) return "no-amount";

  let value: bigint;
  try {
    value = parseEther(amount);
  } catch {
    return "bad-amount";
  }
  if (value <= 0n) return "bad-amount";

  const most = maxSendable(draft.balance, draft.gasPrice);
  if (most === null) return "no-gas";
  if (value > most) return "too-much";

  return null;
}

/** The amount in wei. Only called once `withdrawError` has returned null. */
export function withdrawValue(amount: string): bigint {
  return parseEther(amount.trim());
}

export const WITHDRAW_MESSAGE: Record<WithdrawError, string> = {
  "no-address": "Enter the address to send to.",
  "bad-address": "That is not a valid address.",
  self: "That is this account's own address.",
  "no-amount": "Enter an amount.",
  "bad-amount": "That is not a valid amount.",
  "no-gas": "Could not read the current gas price. Try again.",
  "too-much": "That is more than the balance, leaving nothing for gas.",
};
