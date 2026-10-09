"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import {
  claimTMON,
  faucetConfigured,
  hasClaimed,
  isAlreadyClaimed,
  isFaucetEmpty,
} from "@social/lib/faucet";
import { explainError, isUserCancelled } from "@/lib/wallet/errors";

type Status = "checking" | "ready" | "claiming" | "claimed";

/**
 * The claim button for new wallets.
 *
 * The eligibility rule is read from the faucet contract rather than kept in
 * the client, so the button can only ever offer what the contract would
 * accept. On a wallet that has already claimed it settles into the spent
 * state instead of disappearing — a button that vanishes reads as a bug.
 */
export function FaucetButton({ address }: { address: Address }) {
  const configured = faucetConfigured();
  const [status, setStatus] = useState<Status>(configured ? "checking" : "claimed");
  const [note, setNote] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!configured) return;
    let live = true;
    void hasClaimed(address).then(
      (claimed) => live && setStatus(claimed ? "claimed" : "ready"),
      // An unreachable chain should not hide the button; the contract is the
      // one that decides, and it will refuse a claim that is not allowed.
      () => live && setStatus("ready"),
    );
    return () => {
      live = false;
    };
  }, [configured, address]);

  if (!configured) return null;

  async function claim() {
    if (status !== "ready") return;
    setStatus("claiming");
    setNote(null);
    try {
      await claimTMON();
      setStatus("claimed");
      setNote({ kind: "ok", text: "3 tMON claimed." });
    } catch (e) {
      // Walking away from the passkey prompt is an answer, not an error.
      if (isUserCancelled(e)) {
        setStatus("ready");
        return;
      }
      if (isAlreadyClaimed(e)) {
        setStatus("claimed");
        setNote({ kind: "ok", text: "This wallet already claimed." });
        return;
      }
      setStatus("ready");
      setNote({
        kind: "error",
        text: isFaucetEmpty(e)
          ? "The faucet is empty right now. Check back soon."
          : explainError(e),
      });
    }
  }

  const label =
    status === "checking"
      ? "Checking…"
      : status === "claiming"
        ? "Claiming…"
        : status === "claimed"
          ? "Already claimed"
          : "Claim 3 tMON";

  return (
    <>
      <button
        className={`btn btn-sm${status === "claimed" ? " btn-quiet is-spent" : ""}`}
        onClick={() => void claim()}
        disabled={status !== "ready"}
        title={status === "claimed" ? "One claim per wallet" : "Testnet MON for gas"}
        data-testid="faucet"
      >
        {label}
      </button>
      {note && (
        <p className={note.kind === "error" ? "error-note" : "faucet-note"} role="status">
          {note.text}
        </p>
      )}
    </>
  );
}
