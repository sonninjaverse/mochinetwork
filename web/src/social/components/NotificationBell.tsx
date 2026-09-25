"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { fetchCommunities } from "@social/lib/indexer";
import {
  agoFromBlock,
  fetchActivity,
  fetchNotifications,
  lastSeenBlock,
  markSeen,
} from "@social/lib/notifications";
import {
  DEFAULT_PREFS,
  loadPrefs,
  noticesFrom,
  onPrefsChange,
  savePrefs,
  unreadNotices,
  watchedCommunities,
  type NotifyPrefs,
  type Notice,
  type VoteLevel,
} from "@social/lib/notify";
import { setBadge } from "@social/lib/badge";
import { permalinkPath } from "@social/lib/permalink";
import {
  currentSubscription,
  disablePush,
  enablePush,
  isIos,
  isStandalone,
  pushState,
  syncPush,
  type PushState,
} from "@social/lib/push";
import { getWallet } from "@/lib/wallet";

const POLL_MS = 20_000;
const INDEXER = process.env.NEXT_PUBLIC_INDEXER_URL;

const who = (n: Notice) =>
  n.actorHandle ?? `${n.actor.slice(0, 6)}…${n.actor.slice(-4)}`;

const said: Record<Notice["kind"], string> = {
  reply: "replied to you",
  like: "liked your post",
  dislike: "disagreed with your post",
  post: "posted",
};

/** A row of mutually exclusive choices. */
function Segmented<T extends string>({
  value,
  options,
  onChange,
  testid,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  testid: string;
}) {
  return (
    <span className="seg" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          className={value === o.value ? "is-on" : ""}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          data-testid={`${testid}-${o.value}`}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

/**
 * What has happened to you, and what you want to hear about.
 *
 * Nothing here is stored on a server: replies and votes are already on chain
 * and a notification is a view of them. Which of them you see is a local
 * preference, and how far you have read lives on this device too.
 */
export function NotificationBell() {
  const [address, setAddress] = useState<Address | null>(null);
  const [items, setItems] = useState<Notice[]>([]);
  const [prefs, setPrefs] = useState<NotifyPrefs>(DEFAULT_PREFS);
  const [head, setHead] = useState(0);
  const [seen, setSeen] = useState(0);
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [push, setPush] = useState<PushState>("default");
  const [pushOn, setPushOn] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushNote, setPushNote] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  // Read inside the poll without re-subscribing it every time it moves.
  const seenRef = useRef(0);
  const prefsRef = useRef(prefs);

  useEffect(() => {
    const w = getWallet();
    setAddress(w.rememberedAddress());
    const fromDevice = lastSeenBlock();
    setSeen(fromDevice);
    seenRef.current = fromDevice;
    setPrefs(loadPrefs());
    return w.onLockChange(() => setAddress(getWallet().rememberedAddress()));
  }, []);

  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  const load = useCallback(async () => {
    const me = getWallet().rememberedAddress();
    if (!me) return;

    const [personal, health] = await Promise.all([
      fetchNotifications(me),
      fetch(`${INDEXER}/health`)
        .then((r) => r.json())
        .catch(() => null),
    ]);
    const chainHead = Number(health?.head) || 0;
    if (chainHead) setHead(chainHead);

    // First run: start the cursor at the head, so the bell does not open with
    // every post ever written in the communities you are in.
    let cursor = seenRef.current;
    if (cursor === 0 && chainHead) {
      cursor = chainHead;
      markSeen(cursor);
      seenRef.current = cursor;
      setSeen(cursor);
    }

    const communities = await fetchCommunities(me).catch(() => []);
    const names = communities.filter((c) => c.joined).map((c) => c.name);

    const activity = await fetchActivity(watchedCommunities(prefsRef.current, names), cursor);
    setItems(noticesFrom(personal, activity, prefsRef.current, me));
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [address, load]);

  // A community's own control writes the same preferences; follow it.
  useEffect(
    () =>
      onPrefsChange(() => {
        const next = loadPrefs();
        prefsRef.current = next;
        setPrefs(next);
        void load();
        const me = getWallet().rememberedAddress();
        if (me) void syncPush(me, next);
      }),
    [load],
  );

  // Keep the indexer's copy pointed at whoever is signed in now, and at the
  // current preferences. The subscription itself is the browser's.
  useEffect(() => {
    setPush(pushState());
    if (pushState() === "unsupported" || !address) return;
    let active = true;
    void (async () => {
      const sub = await currentSubscription();
      if (!active) return;
      setPushOn(Boolean(sub));
      if (sub) await syncPush(address, prefsRef.current);
    })();
    return () => {
      active = false;
    };
  }, [address]);

  async function togglePush() {
    if (!address || pushing) return;
    setPushing(true);
    setPushNote(null);
    try {
      if (pushOn) {
        await disablePush();
        setPushOn(false);
      } else {
        const result = await enablePush(address, prefsRef.current);
        setPushOn(result.ok);
        setPush(pushState());
        // A silent failure here is indistinguishable from a button that did
        // nothing, so the reason is shown rather than swallowed.
        if (!result.ok) setPushNote(result.reason);
      }
    } finally {
      setPushing(false);
    }
  }

  // Clicking anywhere else closes it, the way a menu should.
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const unread = unreadNotices(items, seen);

  // Keep the Home Screen icon's number in step with the bell.
  useEffect(() => {
    setBadge(address ? unread : 0);
  }, [address, unread]);

  if (!address) return null;

  function change(next: NotifyPrefs) {
    prefsRef.current = next;
    setPrefs(next);
    // Saving dispatches; the listener above re-reads at once and syncs the
    // indexer, so the panel matches the choice instead of waiting out the poll.
    savePrefs(next);
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    setSettings(false);
    // Marked read on opening, not on closing: you have seen them by then.
    if (next && items.length > 0) {
      markSeen(items[0].block);
      seenRef.current = items[0].block;
      setSeen(items[0].block);
    }
  }

  return (
    <div className="bell-wrap" ref={panel}>
      <button
        className={`tab tab-bell${unread > 0 ? " has-unread" : ""}`}
        onClick={toggle}
        aria-expanded={open}
        title="Notifications"
        data-testid="bell"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
          <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6z" strokeLinejoin="round" />
          <path d="M10.3 20a2 2 0 0 0 3.4 0" strokeLinecap="round" />
        </svg>
        {unread > 0 && <span className="bell-count">{unread > 99 ? "99+" : unread}</span>}
      </button>

      {open && (
        <div className="bell-panel" data-testid="bell-panel">
          <div className="bell-head">
            <span className="bell-title">{settings ? "Notification settings" : "Notifications"}</span>
            <button
              className="bell-gear"
              onClick={() => setSettings((s) => !s)}
              title={settings ? "Back" : "Settings"}
              data-testid="bell-settings"
            >
              {settings ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4m0-12.8-1.4 1.4m-10 10-1.4 1.4" strokeLinecap="round" />
                </svg>
              )}
            </button>
          </div>

          {settings ? (
            <div className="bell-settings" data-testid="bell-settings-panel">
              <div className="bell-group">
                <h4>You</h4>
                <div className="bell-row">
                  <span className="bell-label">Replies</span>
                  <Segmented
                    value={prefs.replies ? "on" : "off"}
                    options={[{ value: "on", label: "On" }, { value: "off", label: "Off" }]}
                    onChange={(v) => change({ ...prefs, replies: v === "on" })}
                    testid="pref-replies"
                  />
                </div>
                <div className="bell-row">
                  <span className="bell-label">Votes</span>
                  <Segmented<VoteLevel>
                    value={prefs.votes}
                    options={[
                      { value: "off", label: "Off" },
                      { value: "meaningful", label: "1 vote+" },
                      { value: "all", label: "All" },
                    ]}
                    onChange={(v) => change({ ...prefs, votes: v })}
                    testid="pref-votes"
                  />
                </div>
              </div>

              <div className="bell-group">
                <h4>This device</h4>
                {push === "unsupported" ? (
                  <p className="bell-note" data-testid="push-status">
                    {isIos() && !isStandalone()
                      ? "On iPhone, add this site to the Home Screen, open it from there, and enable here."
                      : "This browser cannot show notifications."}
                  </p>
                ) : (
                  <>
                    <div className="bell-row">
                      <span className="bell-label">Push notifications</span>
                      <button
                        className="btn btn-quiet btn-sm"
                        onClick={() => void togglePush()}
                        disabled={pushing}
                        data-testid="push-toggle"
                      >
                        {pushOn ? "Disable" : "Enable"}
                      </button>
                    </div>
                    {pushOn && (
                      <p className="bell-note" data-testid="push-status">
                        On for this device.
                      </p>
                    )}
                  </>
                )}
                {pushNote && (
                  <p className="bell-note is-error" data-testid="push-status">
                    {pushNote}
                  </p>
                )}
                {push === "denied" && (
                  <p className="bell-note" data-testid="push-status">
                    Blocked in the browser. Allow notifications for this site to turn it back on.
                  </p>
                )}
              </div>
            </div>
          ) : items.length === 0 ? (
            <p className="bell-empty">Nothing yet. Replies, votes and community posts show up here.</p>
          ) : (
            items.map((n) => (
              <Link
                key={`${n.kind}-${n.actor}-${n.block}-${n.postId ?? ""}`}
                className={`bell-item${n.block > seen ? " is-new" : ""}`}
                href={permalinkPath({ id: n.replyId ?? n.postId! })}
                onClick={() => setOpen(false)}
              >
                <span className="bell-who">{who(n)}</span>{" "}
                {n.kind === "post" ? `posted in m/${n.community}` : said[n.kind]}
                {n.text && <span className="bell-text">{n.text}</span>}
                <span className="bell-when">{agoFromBlock(n.block, head)}</span>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
