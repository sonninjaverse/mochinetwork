"use client";

import { useMemo, useState } from "react";
import type { Address } from "viem";
import type { IndexedPost } from "@social/lib/indexer";
import { Composer } from "./Composer";
import { PostCard } from "./PostCard";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * One comment and its replies.
 *
 * Nesting is the whole point: a flat list of a hundred replies is unreadable,
 * and the reply that answers the reply has nowhere to sit. Collapsing is the
 * other half — a long thread has to fold down to the line you care about.
 */
function Comment({
  post,
  childrenBy,
  viewer,
  onReplied,
}: {
  post: IndexedPost;
  childrenBy: Map<string, IndexedPost[]>;
  viewer: Address | null;
  onReplied?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [replying, setReplying] = useState(false);
  const kids = childrenBy.get(post.id) ?? [];

  if (collapsed) {
    return (
      <div className="comment is-collapsed">
        <button className="comment-toggle" onClick={() => setCollapsed(false)} aria-label="Expand comment">
          +
        </button>
        <span className="comment-collapsed">
          {post.handle ? `u/${post.handle}` : short(post.author)}
          {kids.length > 0 && ` · ${kids.length} ${kids.length === 1 ? "reply" : "replies"}`}
        </span>
      </div>
    );
  }

  return (
    <div className="comment">
      <button
        className="comment-toggle"
        onClick={() => setCollapsed(true)}
        aria-label="Collapse comment"
        title="Collapse"
      >
        –
      </button>
      <div className="comment-branch">
        {/* The body and its children share one vertical line, the way a thread
            reads downward rather than stepping right at every reply. */}
        <PostCard
          item={{ ...post, score: 0n }}
          viewer={viewer}
          onReply={viewer ? () => setReplying((v) => !v) : undefined}
        />

        {/* The reply box opens under the comment it answers, not on another
            page. It says nothing when the comment is not addressed. */}
        {replying && viewer && (
          <div className="comment-reply">
            <Composer
              parentId={BigInt(post.id)}
              placeholder={`Reply to ${post.handle ? `u/${post.handle}` : short(post.author)}`}
              author={viewer}
              defaultOpen
              onPosted={() => {
                setReplying(false);
                onReplied?.();
              }}
            />
          </div>
        )}

        {kids.map((kid) => (
          <Comment
            key={kid.id}
            post={kid}
            childrenBy={childrenBy}
            viewer={viewer}
            onReplied={onReplied}
          />
        ))}
      </div>
    </div>
  );
}

/** The replies to one post, as a tree, with a sort for each level. */
export function CommentTree({
  posts,
  rootId,
  viewer,
  sort,
  onSort,
  onReplied,
}: {
  posts: IndexedPost[];
  rootId: string;
  viewer: Address | null;
  sort: "best" | "new";
  onSort: (sort: "best" | "new") => void;
  /** Refetch after an inline reply lands, so it appears under its parent. */
  onReplied?: () => void;
}) {
  const childrenBy = useMemo(() => {
    const map = new Map<string, IndexedPost[]>();
    for (const post of posts) {
      const key = post.parentId ?? "0";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(post);
    }
    // Best is what Reddit defaults to: the reply the room agreed with first,
    // and a tie goes to the newer one.
    const byBest = (a: IndexedPost, b: IndexedPost) =>
      b.likeCount - b.dislikeCount - (a.likeCount - a.dislikeCount) || b.createdAt - a.createdAt;
    const byNew = (a: IndexedPost, b: IndexedPost) => b.createdAt - a.createdAt;
    for (const level of map.values()) level.sort(sort === "new" ? byNew : byBest);
    return map;
  }, [posts, sort]);

  if (posts.length === 0) return null;
  const roots = childrenBy.get(rootId) ?? [];

  return (
    <section className="comments">
      <div className="comments-sort" role="group" aria-label="Sort comments">
        <button
          className={sort === "best" ? "is-on" : ""}
          aria-pressed={sort === "best"}
          onClick={() => onSort("best")}
        >
          Best
        </button>
        <button
          className={sort === "new" ? "is-on" : ""}
          aria-pressed={sort === "new"}
          onClick={() => onSort("new")}
        >
          New
        </button>
      </div>
      {roots.map((root) => (
        <Comment
          key={root.id}
          post={root}
          childrenBy={childrenBy}
          viewer={viewer}
          onReplied={onReplied}
        />
      ))}
    </section>
  );
}
