"use client";

import type { Address } from "viem";
import { Avatar } from "./Avatar";

/**
 * Something written and signed, waiting for the indexer to catch up.
 *
 * Built like a real card rather than approximately like one. `.post` is a two
 * column grid — the avatar, then everything else — and loose children drop
 * into those columns one at a time, so a byline, a body and a note became a
 * byline crushed into the 40px avatar slot, the body alongside it, and the
 * note wrapping one word per line underneath. One component now, used by both
 * the feed and a thread, because two copies is how the first one got away
 * with being wrong.
 */
export function PendingPost({ text, author }: { text: string; author: Address | null }) {
  return (
    <article className="post is-pending">
      {/* Holds the column open even with nobody to draw, so the text beside it
          stays where text goes. */}
      {author ? <Avatar address={author} /> : <span className="avatar is-blank" />}

      <div className="post-main">
        <header className="post-head">
          {/* is-anon: an address is not a handle, and the @ the other style
              prepends belongs in front of a name. */}
          <span className="post-author is-anon">
            {author ? `${author.slice(0, 6)}…${author.slice(-4)}` : "you"}
          </span>
          <span className="sep">·</span>
          <span className="post-time">just now</span>
        </header>

        <p className="post-body">{text}</p>
        <p className="post-note">on chain, waiting to be indexed</p>
      </div>
    </article>
  );
}
