"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Address } from "viem";
import { profilePath } from "@social/lib/permalink";
import { getWallet, walletKind } from "@/lib/wallet";
import type { WalletMethod } from "@/lib/wallet";
import { explainError, isUserCancelled } from "@/lib/wallet/errors";
import { hasPasskeyHere } from "@/lib/wallet/remember";
import { confirmInviteAccount } from "@social/lib/invites";
import { requestStarterMon, STARTER_EVENT } from "@social/lib/starter";
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
   * Makes the passkey, and asks for a starter drip.
   *
   * A new wallet has to pay gas before it can do anything, and the first
   * thing anyone does is a transaction — claiming from the faucet is one.
   * The indexer sends 0.05 MON once per address so that door is open; the
   * profile shows it as soon as the block lands.
   */
  async function signUp(method: WalletMethod = "passkey") {
    setError(null);
    setBusy(true);
    try {
      const wallet = getWallet();
      await (wallet.createAccountWith?.(method) ?? wallet.createAccount());
      const created = await wallet.getAccount();
      await confirmInviteAccount();
      // Not awaited: signing up must not wait on the drip, and a refusal
      // (already sent, float empty, offline) is not a sign-up failure.
      void requestStarterMon(created)
        .then(() => window.dispatchEvent(new Event(STARTER_EVENT)))
        .catch(() => {});
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
  async function signIn(method: WalletMethod = "passkey") {
    setBusy(true);
    setError(null);
    try {
      const w = getWallet();
      await (w.signInWith?.(method) ?? w.signIn());
      await confirmInviteAccount();
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
    return error ? <span className="error-note" role="alert">{error}</span> : null;
  }

  // Privy owns the whole flow — external wallet or email — so there is no
  // passkey to create or find and the passkey warning below does not apply.
  if (walletKind() === "privy") {
    return (
      <div className="account">
        {error && <span className="error-note">{error}</span>}
        <button
          type="button"
          className="btn"
          onClick={() => void signIn()}
          disabled={busy}
          data-testid="sign-in"
        >
          {busy ? "Waiting…" : "Sign in"}
        </button>
      </div>
    );
  }

  // Passkey and Privy side by side: existing passkey accounts keep their
  // door, and a wallet or email is the other one.
  if (walletKind() === "both") {
    return (
      <div className="account">
        {error && <span className="error-note">{error}</span>}
        <button
          type="button"
          className="btn"
          onClick={() => void signIn("privy")}
          disabled={busy}
          data-testid="sign-in"
        >
          {busy ? "Waiting…" : "Continue with wallet or email"}
        </button>
        {returning ? (
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            onClick={() => void signIn("passkey")}
            disabled={busy}
          >
            {busy ? WORKING : "Use passkey"}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            onClick={() => void signUp("passkey")}
            disabled={busy}
            data-testid="signup-submit"
          >
            {busy ? WORKING : "Create passkey account"}
          </button>
        )}
      </div>
    );
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
