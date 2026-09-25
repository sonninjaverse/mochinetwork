"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Address } from "viem";
import { profilePath } from "@social/lib/permalink";
import { getWallet } from "@/lib/wallet";
import { explainError, isUserCancelled } from "@/lib/wallet/errors";
import { hasPasskeyHere } from "@/lib/wallet/remember";
import { Modal } from "./Modal";

/// The whole of signing up, now that nothing is sent on chain to do it.
const WORKING = "Waiting for your passkey…";

export function SignInButton() {
  const router = useRouter();
  const [address, setAddress] = useState<Address | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The warning before making another account, shown only to someone who
   * already has one.
   *
   * There is nothing to fill in any more, so a first visit goes straight to
   * the passkey. This stays because a fingerprint is not an identity: asking
   * for another passkey makes another account rather than finding the first,
   * and people took that door every time it was offered without a word.
   */
  const [confirming, setConfirming] = useState(false);

  /**
   * Which button leads, and why it is state rather than read during render.
   *
   * WebAuthn gives a site no way to ask whether a passkey exists, so this is
   * remembered locally when one is made — and not forgotten on sign-out, which
   * ends a session without deleting anything. Before it, signing out and
   * coming back looked exactly like a first visit, "Create account" led, and
   * people took it: another identity and an orphaned passkey every time.
   *
   * Reading localStorage during render prerenders as false and hydrates as
   * true, and React abandons the whole tree over the mismatch — which took the
   * feed down with it. Client-only state belongs in an effect.
   */
  const [returning, setReturning] = useState(false);

  useEffect(() => {
    const w = getWallet();
    // Recognised on load, with no prompt. The key is not here — only the name.
    setAddress(w.rememberedAddress());
    setReturning(hasPasskeyHere());
    return w.onLockChange(() => {
      setAddress(getWallet().rememberedAddress());
      setReturning(hasPasskeyHere());
    });
  }, []);

  /**
   * Makes the passkey, and stops there.
   *
   * No gas is sent. An account that quietly arrives funded would hide the one
   * thing a new reader has to learn: that posting and voting here cost
   * something. MON is deposited deliberately, from a wallet the reader
   * controls.
   */
  async function signUp() {
    setError(null);
    setBusy(true);
    try {
      const wallet = getWallet();
      await wallet.createAccount();
      const created = await wallet.getAccount();
      setAddress(created);
      setConfirming(false);
      // Onto the profile, where the username and the wallet both are. Client
      // navigation, so the new session is not thrown away by a reload.
      router.push(profilePath({ address: created }));
    } catch (e) {
      // Saying no is a decision, not a failure — answering it in red tells
      // someone their own choice went wrong.
      if (!isUserCancelled(e)) setError(explainError(e));
      setAddress(getWallet().rememberedAddress());
    } finally {
      setBusy(false);
    }
  }

  /** Someone who already has a passkey. No name is asked for: they have one. */
  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const w = getWallet();
      await w.signIn();
      setAddress(await w.getAccount());
    } catch (e) {
      if (!isUserCancelled(e)) setError(explainError(e));
    } finally {
      setBusy(false);
    }
  }

  if (address) {
    // Nothing in the header once you are signed in. The account is reachable
    // from the rail on a wide screen and the bar on a phone, and repeating the
    // address beside every page's controls was noise, not a destination.
    return null;
  }

  const warning = confirming ? (
    <Modal title="You already have an account here" onClose={() => setConfirming(false)} dismissable={!busy}>
      <p className="modal-lead">
        This makes another, separate one — same fingerprint, different
        account. To get back into the one you have, close this and choose
        Sign in.
      </p>

      {busy && <p className="modal-note">{WORKING}</p>}
      {error && <p className="modal-note is-error">{error}</p>}

      <div className="modal-actions">
        {!busy && (
          <button type="button" className="btn btn-quiet" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        )}
        <button type="button" className="btn" onClick={() => void signUp()} disabled={busy} data-testid="signup-submit">
          {busy ? "Working…" : "Create another account"}
        </button>
      </div>
    </Modal>
  ) : null;

  return (
    <div className="account">
      {warning}
      {error && !confirming && <span className="error-note">{error}</span>}

      {returning ? (
        <>
          <button type="button" className="btn" onClick={() => void signIn()} disabled={busy} data-testid="sign-in">
            {busy ? "Waiting…" : "Sign in"}
          </button>
          {/* The same words as the first-visit button, because it is the
              same action. Two names for one thing was the confusion. */}
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            onClick={() => setConfirming(true)}
            disabled={busy}
          >
            Create account
          </button>
        </>
      ) : (
        <>
          {/* Nothing to sign in with yet, and asking WebAuthn to find a passkey
              that does not exist is what shows a QR code instead of an offer. */}
          <button type="button" className="btn" onClick={() => void signUp()} disabled={busy} data-testid="signup-submit">
            {busy ? WORKING : "Create account"}
          </button>
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            onClick={() => void signIn()}
            disabled={busy}
            data-testid="sign-in"
          >
            {busy ? "Waiting…" : "Sign in"}
          </button>
        </>
      )}
    </div>
  );
}
