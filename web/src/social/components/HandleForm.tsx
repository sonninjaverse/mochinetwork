"use client";

import { useState } from "react";
import { publicClient } from "@social/lib/chain";
import { checkHandle, HANDLE_RULES, registerHandle } from "@social/lib/handle";
import { getWallet } from "@/lib/wallet";
import { explainError, isUserCancelled } from "@/lib/wallet/errors";

/**
 * Claiming a username. The only place that does.
 *
 * Sign-up deliberately does not ask. A name is a transaction, and tying the
 * front door to one meant that when the chain stopped accepting transactions,
 * nobody could get in at all. Here a refusal costs a retry.
 *
 * The contract refuses a second register, so a name is for good. Availability
 * is checked against it before sending, because paying gas to be told the name
 * was taken is a bad way to find out.
 */
export function HandleForm({ onClaimed }: { onClaimed: (handle: string) => void }) {
  const [value, setValue] = useState("");
  const [state, setState] = useState<"idle" | "checking" | "sending">("idle");
  const [error, setError] = useState<string | null>(null);

  const busy = state !== "idle";

  async function claim() {
    const handle = value.trim().toLowerCase();
    setError(null);

    setState("checking");
    const available = await checkHandle(handle);
    if (!available.ok) {
      setState("idle");
      return setError(
        available.reason === "taken"
          ? "Someone has that one already."
          : available.reason === "reserved"
            ? "That name belongs to a page of the site."
            : available.reason === "format"
              ? HANDLE_RULES
              : "Could not reach the chain to check. Try again.",
      );
    }

    // Claiming a name is a transaction, and an account no longer arrives with
    // gas in it. Asked here so the answer is "get some MON" rather than
    // whatever the node says when it runs out of ways to be helpful.
    const address = getWallet().rememberedAddress();
    if (address && (await publicClient.getBalance({ address })) === 0n) {
      setState("idle");
      return setError("You need some MON first — deposit from your wallet.");
    }

    setState("sending");
    try {
      await registerHandle(handle);
      onClaimed(handle);
    } catch (e) {
      // A dismissed passkey prompt is an answer, not a crash.
      if (!isUserCancelled(e)) setError(explainError(e));
    } finally {
      setState("idle");
    }
  }

  return (
    <div className="handle-form">
      <div className="handle-row">
        <label className={`handle-field is-large${busy ? " is-disabled" : ""}`} htmlFor="handle">
          <span className="handle-at">@</span>
          <input
            id="handle"
            value={value}
            maxLength={15}
            placeholder="yourname"
            aria-label="Username"
            disabled={busy}
            onChange={(e) => setValue(e.target.value.toLowerCase())}
            onKeyDown={(e) => e.key === "Enter" && !busy && void claim()}
            data-testid="handle-input"
          />
        </label>
        <button
          className="btn"
          onClick={() => void claim()}
          disabled={busy || value.trim().length === 0}
          data-testid="handle-submit"
        >
          {state === "checking" ? "Checking…" : state === "sending" ? "Signing…" : "Claim"}
        </button>
      </div>

      {error ? (
        <p className="handle-note is-error">{error}</p>
      ) : (
        <p className="handle-note">{HANDLE_RULES} This cannot be changed later.</p>
      )}
    </div>
  );
}
