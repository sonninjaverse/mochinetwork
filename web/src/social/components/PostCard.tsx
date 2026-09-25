"use client";

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { Address } from "viem";
import { dislikePost, likePost } from "@social/lib/actions";
import type { FeedItem } from "@social/lib/feed";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { resolveMedia } from "@social/lib/media";
import { permalink, permalinkPath, profilePath } from "@social/lib/permalink";
import { isSaved, onSavedChange, toggleSaved } from "@social/lib/saved";
import { netVotes, type Vote } from "@social/lib/votes";
import { stripTag } from "@social/lib/community";
import { Avatar } from "./Avatar";

function ago(createdAt: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - createdAt);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * One post.
 *
 * Takes the viewer rather than a signed-in flag. The flag could disagree with
 * who was actually reading — and did: a profile page passed false while a
 * viewer was right there, so every vote control on it was dead. An address
 * cannot contradict itself, and the card needs one anyway to know which posts
 * are the reader's own.
 */
export function PostCard({
  item,
  viewer,
  openable = true,
  onReply,
}: {
  item: FeedItem;
  viewer: Address | null;
  /** False for the post a page is already showing — it has nowhere to go. */
  openable?: boolean;
  /**
   * Reply in place, the way a comment thread replies to itself. Without it the
   * reply control is a link to the post's own page, which is right in a feed
   * and wrong inside a thread that is already on it.
   */
  onReply?: () => void;
}) {
  const signedIn = viewer !== null;
  // The contract refuses a vote on your own post, so the button must not offer
  // one: an optimistic highlight that reverts reads as a broken button.
  const isYou = signedIn && viewer!.toLowerCase() === item.author.toLowerCase();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(isSaved(item.id));
    return onSavedChange(() => setSaved(isSaved(item.id)));
  }, [item.id]);

  // What the indexer says this viewer has already done. The card outlives a
  // refetch — the key is the post id — so local state alone cannot tell a vote
  // that is still in flight from one already counted in the totals.
  const known = item.viewerVote ?? null;
  const [chosen, setChosen] = useState<Vote>(known);

  // A refetch can land after a vote was cast elsewhere, or after this one
  // confirmed. Follow the indexer once it has caught up.
  const [lastKnown, setLastKnown] = useState<Vote>(known);
  if (known !== lastKnown) {
    setLastKnown(known);
    setChosen(known);
  }

  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // Shown only after a reader presses a vote button on their own post, then
  // it fades. A line under every own post was noise.
  const [selfVote, setSelfVote] = useState(false);
  const selfVoteTimer = useRef<number | null>(null);
  const router = useRouter();

  useEffect(() => () => {
    if (selfVoteTimer.current !== null) window.clearTimeout(selfVoteTimer.current);
  }, []);

  function refuseSelfVote() {
    setSelfVote(true);
    if (selfVoteTimer.current !== null) window.clearTimeout(selfVoteTimer.current);
    selfVoteTimer.current = window.setTimeout(() => setSelfVote(false), 3000);
  }

  /**
   * Copies a link to this post, and only that.
   *
   * navigator.share used to run first on a phone, which handed the link to an
   * OS sheet nobody asked for and reported nothing back when it was
   * cancelled. A button labelled Copy should copy.
   */
  async function share() {
    try {
      await navigator.clipboard.writeText(permalink(item));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // A browser that refuses clipboard access. Nothing useful to say.
    }
  }

  // Optimistic, unlike the composer: a vote produces no visible result of its
  // own, so without immediate feedback the button reads as broken for a block.
  //
  // A vote is one direction at a time, matching the contract: voting the other
  // way withdraws the first rather than counting in both columns.
  async function cast(direction: "up" | "down") {
    // The contract refuses a self-vote; say so instead of doing nothing.
    if (isYou) return refuseSelfVote();
    if (chosen === direction || busy) return;
    const previous = chosen;
    setBusy(true);
    setChosen(direction);
    try {
      if (direction === "up") await likePost(BigInt(item.id));
      else await dislikePost(BigInt(item.id));
    } catch {
      setChosen(previous);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Opening a post should be clicking the post.
   *
   * It was reachable only through the little speech bubble in the footer,
   * which is a target the width of a word for the most common thing anyone
   * does on a feed. Anything a reader might have meant instead is left alone:
   * a click that landed on a link or a button belongs to that control, and a
   * click that ends a text selection was someone copying, not navigating.
   *
   * Client navigation, the same as the links around it. Held modifiers open a
   * tab, the way a link would.
   */
  function open(event: ReactMouseEvent<HTMLElement>) {
    if (event.target instanceof Element && event.target.closest("a, button, input, textarea")) return;
    if (window.getSelection()?.toString()) return;

    const path = permalinkPath(item);
    if (event.metaKey || event.ctrlKey || event.shiftKey) window.open(path, "_blank");
    else router.push(path);
  }

  return (
    <article
      className={`post${openable ? " is-openable" : ""}`}
      onClick={openable ? open : undefined}
    >
      <Link href={profilePath(item)} aria-label="View profile">
        <Avatar address={item.author} />
      </Link>

      <div className="post-main">
        <header className="post-head">
          <Link href={profilePath(item)} className="post-identity">
            {item.handle ? (
              <>
                <span className="post-author">{item.handle}</span>
                <span className="post-hint">{short(item.author)}</span>
              </>
            ) : (
              <span className="post-author is-anon">{short(item.author)}</span>
            )}
          </Link>
          {item.authorKarma !== undefined && (
            <span className="post-karma" title="Post and comment karma" data-testid="author-karma">
              {item.authorKarma} karma
            </span>
          )}
          <span className="sep">·</span>
          <span className="post-time">{ago(item.createdAt)}</span>
        </header>

        {item.community && <Link className="community-chip" href={`/m/${item.community}/`}>m/{item.community}</Link>}
        {item.text && <p className="post-body">{
          item.community && (!item.parentId || item.parentId === "0") ? stripTag(item.text, item.community) : item.text
        }</p>}

        {item.mediaURI && (
          // Not next/image: the host is a gateway chosen at runtime, and the
          // optimiser would need every one allow-listed at build time.
          // eslint-disable-next-line @next/next/no-img-element
          <img className="post-media" src={resolveMedia(item.mediaURI)} alt="" loading="lazy" />
        )}

        <footer className="post-foot">
          <span className="votes">
            <button
              className={`act${chosen === "up" ? " is-on" : ""}`}
              onClick={() => cast("up")}
              disabled={!signedIn || busy}
              title={isYou ? "You cannot vote on your own post" : signedIn ? "Upvote" : "Sign in to vote"}
              data-testid="like-button"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <span className={`vote-count${chosen ? " is-voted" : ""}`}>
              {netVotes(item.likeCount, item.dislikeCount, chosen, known)}
            </span>

            <button
              className={`act is-down${chosen === "down" ? " is-on" : ""}`}
              onClick={() => cast("down")}
              disabled={!signedIn || busy}
              title={isYou ? "You cannot vote on your own post" : signedIn ? "Downvote" : "Sign in to vote"}
              data-testid="dislike-button"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 5v14M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </span>

          {/* A fixed slot: "Reply" and "12" are different widths, and without
              one the share control sat at a different place on every card. */}
          {onReply ? (
            <button className="act act-reply" onClick={onReply} title="Reply" data-testid="inline-reply">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a8 8 0 0 1-8 8H4l2.2-2.6A8 8 0 1 1 21 12z" strokeLinejoin="round" />
              </svg>
              {item.replyCount ? item.replyCount : "Reply"}
            </button>
          ) : (
            <Link className="act act-reply" href={permalinkPath(item)} title="Replies">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a8 8 0 0 1-8 8H4l2.2-2.6A8 8 0 1 1 21 12z" strokeLinejoin="round" />
              </svg>
              {item.replyCount ? item.replyCount : "Reply"}
            </Link>
          )}

          {/* A private bookmark, so it lives on the device rather than on
              chain — see lib/saved.ts. */}
          <button
            className={`act act-icon${saved ? " is-on" : ""}`}
            onClick={() => toggleSaved(item.id)}
            title={saved ? "Saved" : "Save"}
            aria-label={saved ? "Remove from saved" : "Save this post"}
            data-testid="save-button"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
              <path d="M6 4h12v17l-6-4-6 4z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* The icon carries it. "Copy link" spelled out was the longest
              thing in the row and the least interesting — every other control
              here is a mark you read once and recognise after. The tick is the
              receipt: with no words there has to be something that changes. */}
          <button
            className={`act act-icon${copied ? " is-on" : ""}`}
            onClick={share}
            title={copied ? "Link copied" : "Copy a link to this post"}
            aria-label={copied ? "Link copied" : "Copy a link to this post"}
            data-testid="share-button"
          >
            {copied ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 15V4m0 0L8.5 7.5M12 4l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 13v4.5A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5V13" strokeLinecap="round" />
              </svg>
            )}
          </button>

        </footer>

        {/* Only after a press. A disabled button explains nothing and a
            permanent line was noise; the answer arrives when it is asked for. */}
        {selfVote && (
          <p className="post-note" data-testid="own-vote-note">
            You cannot vote on your own post.
          </p>
        )}
      </div>
    </article>
  );
}
