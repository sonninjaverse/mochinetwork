"use client";

import { useState } from "react";
import type { Address } from "viem";
import { DepositModal } from "./DepositModal";
import { WithdrawModal } from "./WithdrawModal";

/**
 * The two things you can do with your own MON, both behind a dialog.
 *
 * Kept beside the balance on the profile, and only there: they act on your
 * account, so they belong where the account is described.
 */
export function WalletActions({
  address,
  balance,
  onChanged,
}: {
  address: Address;
  balance: bigint | null;
  /** Called after a send, so the balance beside these buttons catches up. */
  onChanged: () => void;
}) {
  const [open, setOpen] = useState<"deposit" | "withdraw" | null>(null);

  return (
    <>
      <button
        className="btn btn-quiet btn-sm"
        onClick={() => setOpen("deposit")}
        data-testid="deposit"
      >
        Deposit
      </button>
      <button
        className="btn btn-quiet btn-sm"
        onClick={() => setOpen("withdraw")}
        // The amount has nothing to validate against until the balance lands.
        disabled={balance === null}
        data-testid="withdraw"
      >
        Withdraw
      </button>

      {open === "deposit" && <DepositModal address={address} onClose={() => setOpen(null)} />}
      {open === "withdraw" && (
        <WithdrawModal
          address={address}
          balance={balance}
          onClose={() => setOpen(null)}
          onSent={onChanged}
        />
      )}
    </>
  );
}
