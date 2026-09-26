"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { confirmInviteAccount } from "@social/lib/invites";
import { isUserCancelled } from "@/lib/wallet/errors";

const BASE = process.env.NEXT_PUBLIC_INDEXER_URL;

/** Invite links prefill only; the native POST is what spends a code. */
export function GateForm() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [bad, setBad] = useState(false);
  const [next, setNext] = useState("/");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setBad(params.get("bad") === "1");
    setCode((params.get("code") ?? "").slice(0, 128));
    const target = params.get("next") ?? "/";
    setNext(target.startsWith("/") && !target.startsWith("//") && !/[\\\x00-\x20]/.test(target) ? target : "/");
    setReady(true);
  }, []);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      await confirmInviteAccount();
      router.replace(next);
      router.refresh();
    } catch (e) {
      if (!isUserCancelled(e)) setError(e instanceof Error ? e.message : "Could not sign in. Please try again.");
    } finally { setBusy(false); }
  }

  return (
    <div className="gate-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="gate-mark" src="/brand/mochi-mark.svg" alt="" width={60} height={60} />
      <h1>You’re invited.</h1>
      <p className="gate-lead">A place for you and your people. Enter an invite code from a friend to join Mochi.</p>
      <form method="post" action={BASE ? `${BASE}/gate` : "#"} onSubmit={() => setBusy(true)}>
        <input type="hidden" name="next" value={next} />
        <label className="gate-field">
          <span>Invite code</span>
          <input name="code" value={code} onChange={e => setCode(e.target.value)} autoComplete="off"
            autoCapitalize="none" spellCheck={false} autoFocus required maxLength={128}
            disabled={!BASE || !ready} readOnly={busy} placeholder="mochi-…" data-testid="gate-code" />
        </label>
        {(bad || !BASE) && <p className="gate-error" role="alert" data-testid="gate-error">
          {BASE ? "That code is invalid or has already been used. Ask your friend for an unused invite." : "This build has no API URL configured."}
        </p>}
        <button className="btn gate-submit" type="submit" disabled={!BASE || !ready || busy || !code.trim()} data-testid="gate-submit">
          {busy ? "One moment…" : "Accept invitation"}
        </button>
        <p className="gate-invite-note">Each code can be used once. Your own invitations arrive when you create your account.</p>
      </form>
      <div className="gate-returning">
        <p>Already part of Mochi?</p>
        <button type="button" className="btn btn-quiet" onClick={() => void signIn()} disabled={!BASE || !ready || busy} data-testid="gate-sign-in">
          {busy ? "One moment…" : "Sign in with passkey"}
        </button>
        {error && <p className="gate-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
