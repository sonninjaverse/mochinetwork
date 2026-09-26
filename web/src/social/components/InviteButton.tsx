"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useViewer } from "@social/lib/viewer";
import { gateStatus, loadInvitations, type Invitations } from "@social/lib/invites";
import { profilePath } from "@social/lib/permalink";
import { isUserCancelled } from "@/lib/wallet/errors";
import { Modal } from "./Modal";

export function InviteButton({ sidebar = false }: { sidebar?: boolean }) {
  const viewer = useViewer();
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<Invitations | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void gateStatus().then(status => { if (active) setEnabled(status.enabled); }).catch(() => {});
    return () => { active = false; };
  }, []);
  useEffect(() => { setOpen(false); setData(null); }, [viewer]);

  async function load() {
    setOpen(true);
    setBusy(true);
    setError(null);
    setData(null);
    setCopied(null);
    try { setData(await loadInvitations()); }
    catch (e) {
      setError(isUserCancelled(e) ? "Confirm with your passkey when you’re ready." : e instanceof Error ? e.message : "Could not load invitations. Try again.");
    } finally { setBusy(false); }
  }

  async function copy(code: string, link: boolean) {
    const text = link ? `${window.location.origin}/gate?code=${encodeURIComponent(code)}` : code;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(`${code}:${link}`);
      setError(null);
    } catch { setError("Could not copy. Select the code and copy it manually."); }
  }

  if (!viewer || !enabled) return null;
  return <>
    <button type="button" className={sidebar ? "sidebar-link invite-nav" : "btn btn-quiet btn-sm"}
      onClick={() => void load()} data-testid="invite-friends">Invite friends</button>
    {open && <Modal title="Invite friends" onClose={() => setOpen(false)} dismissable={!busy}>
      <div className="invites-body">
        <p className="modal-lead">Good company starts with an invitation.</p>
        {busy && <p className="modal-note" role="status">Confirming your account…</p>}
        {data && <>
          <div className="invites-summary">
            <span><strong>{data.remaining}</strong> invites left</span>
            <span>{data.joined} {data.joined === 1 ? "friend" : "friends"} joined</span>
          </div>
          <p className="modal-note">Each code lets one friend in. Once they create an account, they get {data.allowance} invites of their own.</p>
          <ul className="invite-list">
            {data.codes.map(invite => <li key={invite.code} className={`invite-card${invite.usedAt !== null ? " is-used" : ""}`}>
              <div className="invite-code-row">
                <code>{invite.code}</code>
                <span className="invite-status">{invite.usedBy ? "Joined" : invite.usedAt !== null ? "Accepted" : "Available"}</span>
              </div>
              {invite.usedBy ? <p className="invite-used-by">Joined by <Link href={profilePath({ address: invite.usedBy as `0x${string}`, handle: invite.handle })}>
                {invite.handle ? `@${invite.handle}` : `${invite.usedBy.slice(0, 6)}…${invite.usedBy.slice(-4)}`}
              </Link></p> : invite.usedAt !== null ? <p className="invite-used-by">Your friend can now create their account.</p> :
                <div className="invite-actions">
                  <button className="btn btn-quiet btn-sm" onClick={() => void copy(invite.code, false)}>
                    {copied === `${invite.code}:false` ? "Copied!" : "Copy code"}
                  </button>
                  <button className="btn btn-sm" onClick={() => void copy(invite.code, true)}>
                    {copied === `${invite.code}:true` ? "Link copied!" : "Copy link"}
                  </button>
                </div>}
            </li>)}
          </ul>
          {data.remaining === 0 && <p className="modal-note">All your invitations have been accepted. Your friends can keep the circle growing.</p>}
        </>}
        {error && <p className="modal-note is-error" role="alert">{error}</p>}
        {!busy && <button className="btn btn-quiet btn-sm" onClick={() => void load()}>{data ? "Refresh" : "Try again"}</button>}
      </div>
    </Modal>}
  </>;
}
