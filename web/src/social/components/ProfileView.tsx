"use client";

import { useCallback, useEffect, useState } from "react";
import { formatEther } from "viem";
import type { Address } from "viem";
import { publicClient } from "@social/lib/chain";
import { fetchPosts, type IndexedPost } from "@social/lib/indexer";
import { onSavedChange, savedIds } from "@social/lib/saved";
import {
  describeWeight,
  loadProfile,
  loadTrust,
  type Profile,
  type Trust,
} from "@social/lib/profile";
import { resolveHandle } from "@social/lib/permalink";
import { parsePath } from "@social/lib/route";
import { getWallet } from "@/lib/wallet";
import { BRAND } from "@/lib/brand";
import { Avatar } from "./Avatar";
import { BackLink } from "./BackLink";
import { HandleForm } from "./HandleForm";
import { Masthead } from "./Masthead";
import { Modal } from "./Modal";
import { Sidebar } from "./Sidebar";
import { PostCard } from "./PostCard";
import { WalletActions } from "./WalletActions";

/**
 * A balance, short enough to sit in a row of buttons.
 *
 * Eighteen decimals is the chain's business. Three is enough to tell whether
 * there is gas, and anything smaller than that but not zero is worth saying is
 * not nothing rather than rounding away to 0.
 */
function formatMon(wei: bigint): string {
  if (wei === 0n) return "0";
  const exact = Number(formatEther(wei));
  if (exact < 0.001) return "<0.001";
  return String(Math.round(exact * 1000) / 1000);
}

export function ProfileView() {
  const [address, setAddress] = useState<Address | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<IndexedPost[]>([]);
  const [comments, setComments] = useState<IndexedPost[]>([]);
  const [saved, setSaved] = useState<IndexedPost[]>([]);
  const [tab, setTab] = useState<"posts" | "comments" | "saved">("posts");
  const [trust, setTrust] = useState<Trust | null>(null);
  const [missing, setMissing] = useState(false);
  const [me, setMe] = useState<Address | null>(null);
  // Held locally until the indexer catches up, so the name you just claimed
  // does not vanish for a block.
  const [claimed, setClaimed] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  // The name is in the path, so there is no reason to show an address while
  // two round trips go and fetch the name back.
  const [pathHandle, setPathHandle] = useState<string | null>(null);
  // Gas. Only your own, and only because nothing funds an account unasked any
  // more — whether you can post at all is now a thing you have to be able to
  // see. Read from the chain rather than the indexer, like everything else
  // here that is a fact about an account rather than about its posts.
  const [balance, setBalance] = useState<bigint | null>(null);

  /**
   * The identity comes from
   * the path — /alice, /0x…, or either of the shapes that shipped before it.
   * A name has to go through the indexer, because only the indexer knows who
   * holds one right now.
   */
  useEffect(() => {
    // Reading the remembered address never prompts, so a visitor is
    // unaffected — but it has to keep up, because signing in on your own
    // profile is how anyone reaches the username form.
    const w = getWallet();
    setMe(w.rememberedAddress());
    const unsubscribe = w.onLockChange(() => setMe(getWallet().rememberedAddress()));

    const target = parsePath(window.location.pathname);
    if (target.kind !== "profile") {
      setMissing(true);
    } else if (target.address) {
      setAddress(target.address as Address);
    } else if (target.handle) {
      setPathHandle(target.handle);
      void resolveHandle(target.handle).then((found) =>
        found ? setAddress(found as Address) : setMissing(true),
      );
    } else {
      setMissing(true);
    }

    return unsubscribe;
  }, []);

  const isYou = Boolean(me && address && me.toLowerCase() === address.toLowerCase());

  // The tab says "Profile" until the page knows whose. One prerendered page
  // serves every address, so this is the only moment the name exists.
  useEffect(() => {
    if (!address) return;
    const who = profile?.handle ?? pathHandle ?? `${address.slice(0, 6)}…${address.slice(-4)}`;
    document.title = `${who} · ${BRAND.name}`;
  }, [address, profile?.handle, pathHandle]);

  useEffect(() => {
    if (!address) return;
    void loadProfile(address, me).then((result) => {
      if (!result) return setMissing(true);
      setProfile(result.profile);
      setPosts(result.posts);
      setComments(result.comments);
    });
    void loadTrust(address).then(setTrust);
  }, [address, me]);

  const refreshBalance = useCallback(() => {
    if (!address || !isYou) return;
    void publicClient.getBalance({ address }).then(setBalance, () => setBalance(null));
  }, [address, isYou]);

  useEffect(refreshBalance, [refreshBalance]);

  // Saved posts live on this device, so they are only ever this reader's, and
  // only fetched when the tab is opened.
  useEffect(() => {
    if (tab !== "saved" || !isYou) return;
    const load = () => {
      const ids = savedIds();
      if (ids.length === 0) {
        setSaved([]);
        return;
      }
      void fetchPosts(ids, me ?? undefined).then(setSaved);
    };
    load();
    // Unsaving from the list has to take the row out of it, not wait for a tab
    // change.
    return onSavedChange(load);
  }, [tab, isYou, me]);

  if (missing) {
    return (
      <main className="shell">
        <Masthead />
        <BackLink />
        <p className="state">No account here — the name or address does not exist.</p>
      </main>
    );
  }

  return (
    <main className="shell">
      <Masthead />
      <div className="layout">
        <Sidebar />
        <div className="layout-main">
      <BackLink />

      <section className="profile">
        <div className="profile-top">
          {address && <Avatar address={address} size={64} />}

          {/* Somebody else's page. This is the one screen entirely about a
              person, and until now it was the only place you could not
              follow them from. */}

          {/* Top right, on your own page only. These act on the account
              rather than describe it, so they sit apart from the numbers —
              and out of the header, where a sign-out button beside every
              page's tabs is one people hit by accident. */}
          {isYou && address && (
            <div className="profile-actions">
              {balance !== null && (
                <span className="profile-balance" title={`${formatEther(balance)} MON`}>
                  {formatMon(balance)} MON
                </span>
              )}
              <WalletActions address={address} balance={balance} onChanged={refreshBalance} />
              <button
                className="btn btn-quiet btn-sm"
                onClick={() => getWallet().lock()}
                data-testid="sign-out"
              >
                Sign out
              </button>
            </div>
          )}
        </div>

        <div className="profile-id">
          <h1>
            {claimed ??
              profile?.handle ??
              pathHandle ??
              (address ? `${address.slice(0, 8)}…${address.slice(-6)}` : "…")}
          </h1>
          {(claimed ?? profile?.handle ?? pathHandle) && address && (
            <p className="profile-addr">{address}</p>
          )}
          {profile?.joined != null && (
            <p className="profile-cake" title="Their earliest post on chain">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
                <path d="M4 20h16M5 20v-6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6M12 12V9M12 9a2 2 0 1 0-2-2c0 1 1 1.4 2 2z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Cake day ·{" "}
              {new Date(profile.joined * 1000).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          )}
        </div>

        {/* Your own page, and no name yet. Sign-up does not ask for one — see
            HandleForm — so this is where every name is claimed. It is a button
            and a dialog rather than a standing panel: on a brand new account
            the account itself is the page, and a form sitting open in it was
            the largest thing on screen. */}
        {isYou && !claimed && !profile?.handle && (
          <button
            className="btn btn-sm profile-claim"
            onClick={() => setClaiming(true)}
            data-testid="claim-username"
          >
            Claim username
          </button>
        )}

        {claiming && (
          <Modal title="Claim username" onClose={() => setClaiming(false)}>
            <HandleForm
              onClaimed={(handle) => {
                setClaimed(handle);
                setClaiming(false);
              }}
            />
          </Modal>
        )}

        {/* Karma, Posts and Comments, with karma read straight from the
            contract rather than from the indexer. */}
        <dl className="profile-stats">
          <div>
            <dt title="Weighted votes on everything they have written, on chain">
              Karma
            </dt>
            <dd data-testid="karma">{trust?.karma ?? "—"}</dd>
          </div>
          <div>
            <dt>Posts</dt>
            <dd>{profile?.posts ?? "—"}</dd>
          </div>
          <div>
            <dt>Comments</dt>
            <dd>{profile?.comments ?? "—"}</dd>
          </div>
        </dl>

        {trust && (
          <div className="trust">
            <div className="trust-head">
              <span className="trust-label">Vote weight</span>
              {/* Out of 200 because that is where the ladder ends — 100 is one
                  whole vote, 200 is the cap at two. A denominator of 100 made
                  125 look past the end while the bar sat at five eighths. */}
              <span className="trust-value" title="100 is one whole vote; 200 is the cap">
                {trust.weight} / 200
              </span>
            </div>
            {/* The bar spans the whole ladder, so the cap fills it. */}
            <div className="trust-bar">
              <span style={{ width: `${Math.min(trust.weight / 2, 100)}%` }} />
            </div>
            <p className="trust-desc">{describeWeight(trust, isYou)}</p>
            {/* Read from the contract, not from the indexer — a reputation
                score you have to take a server's word for is not one. */}
            <p className="trust-note">Read from PostRegistry on chain. Anyone can check it.</p>
          </div>
        )}
      </section>

      <div className="account-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "posts"}
          className={tab === "posts" ? "is-on" : ""}
          onClick={() => setTab("posts")}
          data-testid="profile-posts"
        >
          Posts
        </button>
        <button
          role="tab"
          aria-selected={tab === "comments"}
          className={tab === "comments" ? "is-on" : ""}
          onClick={() => setTab("comments")}
          data-testid="profile-comments"
        >
          Comments
        </button>
        {/* Saved is private and device-local, so it only exists on your own
            page. On someone else's there is nothing it could show. */}
        {isYou && (
          <button
            role="tab"
            aria-selected={tab === "saved"}
            className={tab === "saved" ? "is-on" : ""}
            onClick={() => setTab("saved")}
            data-testid="profile-saved"
          >
            Saved
          </button>
        )}
      </div>

      {(() => {
        const list = tab === "posts" ? posts : tab === "comments" ? comments : saved;
        if (list.length === 0) {
          const empty =
            tab === "posts" ? "No posts yet." : tab === "comments" ? "No comments yet." : "Nothing saved yet.";
          return <p className="state">{empty}</p>;
        }
        return list.map((p) => <PostCard key={p.id} item={{ ...p, score: 0n }} viewer={me} />);
      })()}
        </div>
      </div>
    </main>
  );
}
