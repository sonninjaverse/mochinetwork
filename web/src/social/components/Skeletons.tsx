"use client";

import { useEffect, useState, type ReactNode } from "react";

/// The same wait the feed uses: a skeleton that flashes for 80ms reads as a
/// glitch, so short loads get nothing and simply arrive.
const DELAY_MS = 180;

/**
 * Holds a skeleton back until it means something.
 *
 * Pages that load instantly should not blink through a placeholder on the way
 * in. Until the delay elapses this renders the quiet spacer the feed already
 * uses, so the page height does not jump when the skeleton (or the content)
 * shows up.
 */
export function DelayedSkeleton({ children }: { children: ReactNode }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShow(true), DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!show) return <div className="feed-quiet" />;
  return <div aria-busy="true">{children}</div>;
}

/** One post row, the shape every list here uses. */
export function PostSkeleton({ media = false }: { media?: boolean }) {
  return (
    <div className="post post-skeleton">
      <span className="skeleton-avatar" />
      <div className="post-main">
        <span className="skeleton-line is-head" />
        <span className="skeleton-line" />
        <span className="skeleton-line is-short" />
        {media && <span className="skeleton-line is-media" />}
      </div>
    </div>
  );
}

/** Avatar, name, numbers — a profile before it has any of them. */
export function ProfileSkeleton() {
  return (
    <>
      <section className="profile profile-skeleton">
        <div className="profile-top">
          <span className="skeleton-avatar is-large" />
        </div>
        <div className="profile-id">
          <span className="skeleton-line is-title" />
          <span className="skeleton-line is-short" />
        </div>
        <div className="profile-stats">
          {Array.from({ length: 3 }, (_, i) => (
            <span className="skeleton-line is-stat" key={i} />
          ))}
        </div>
      </section>
      {Array.from({ length: 3 }, (_, i) => (
        <PostSkeleton key={i} />
      ))}
    </>
  );
}

/** A permalink page: the root post with a couple of voices under it. */
export function ThreadSkeleton() {
  return (
    <>
      <PostSkeleton media />
      <div className="comments">
        <PostSkeleton />
        <PostSkeleton />
      </div>
    </>
  );
}

/** A community header and its first rows. */
export function CommunitySkeleton() {
  return (
    <>
      <div className="community-banner" aria-hidden />
      <section className="community-header profile-skeleton">
        <div className="profile-id">
          <span className="skeleton-line is-title" />
          <span className="skeleton-line is-short" />
        </div>
      </section>
      {Array.from({ length: 3 }, (_, i) => (
        <PostSkeleton key={i} />
      ))}
    </>
  );
}
