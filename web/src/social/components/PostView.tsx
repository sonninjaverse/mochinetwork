"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { fetchPosts, fetchThread, type IndexedPost } from "@social/lib/indexer";
import { resolveAuthorPost, resolveHandlePost } from "@social/lib/permalink";
import { parsePath } from "@social/lib/route";
import { getWallet } from "@/lib/wallet";
import { BRAND } from "@/lib/brand";
import { BackLink } from "./BackLink";
import { CommentTree } from "./CommentThread";
import { Composer } from "./Composer";
import { Masthead } from "./Masthead";
import { PendingPost } from "./PendingPost";
import { Sidebar } from "./Sidebar";
import { PostCard } from "./PostCard";

/** One post, at its own address. */
export function PostView() {
  const [id, setId] = useState<string | null>(null);
  const [post, setPost] = useState<IndexedPost | null>(null);
  const [viewer, setViewer] = useState<Address | null>(null);
  const [missing, setMissing] = useState(false);
  const [replies, setReplies] = useState<IndexedPost[]>([]);
  const [sort, setSort] = useState<"best" | "new">("best");
  const [parent, setParent] = useState<IndexedPost | null>(null);
  const [pending, setPending] = useState<string[]>([]);

  /**
   * Either the chain's own id, or an author's own post number — the second
   * has to be asked about, because only the indexer knows who holds a name.
   */
  // Signing in happens on this page, so the viewer cannot be read once and
  // left: without this the reply box never appeared for anyone who signed in
  // while reading a thread.
  useEffect(() => {
    const w = getWallet();
    setViewer(w.rememberedAddress());
    return w.onLockChange(() => setViewer(getWallet().rememberedAddress()));
  }, []);

  useEffect(() => {
    const target = parsePath(window.location.pathname);
    if (target.kind === "post") return setId(target.id);
    if (target.kind !== "authorPost") return setMissing(true);

    const resolve = target.address
      ? resolveAuthorPost(target.address, target.index)
      : resolveHandlePost(target.handle!, target.index);

    void resolve.then((found) => (found ? setId(found) : setMissing(true)));
  }, []);

  useEffect(() => {
    if (!id) return;
    void fetchPosts([id], viewer ?? undefined).then((posts) => {
      if (posts.length === 0) return setMissing(true);
      setPost(posts[0]);
      document.title = `${posts[0].handle ?? "Post"} · ${BRAND.name}`;
    });
  }, [id, viewer]);

  // The post this one answers, when it answers one. Only the direct parent:
  // the chain stores that and nothing more, and a whole thread walked upward
  // would be a request per level.
  useEffect(() => {
    const id = post?.parentId;
    if (!id || id === "0") return setParent(null);
    void fetchPosts([id], viewer ?? undefined).then((found) => setParent(found[0] ?? null));
  }, [post?.parentId, viewer]);

  // The whole thread in one request, then nested on the client. The sort is a
  // reading order, not a ranking contract: it never touches the chain, and a
  // conversation still reads in the tree it was written in.
  const loadReplies = useCallback(async () => {
    if (!id) return;
    const ids = await fetchThread(id);
    setReplies(ids.length ? await fetchPosts(ids, viewer ?? undefined) : []);
  }, [id, viewer]);

  useEffect(() => {
    void loadReplies();
  }, [loadReplies]);

  // Drop anything the indexer has caught up on. Without this a reply stayed on
  // screen twice — once as itself, once as the placeholder that announced it.
  const indexed = new Set(replies.map((r) => r.text));
  const unconfirmed = pending.filter((t) => !indexed.has(t));

  /**
   * Keeps looking until the indexer has the reply.
   *
   * The placeholder says it is waiting to be indexed, so it has to actually
   * wait: one refetch at submit time asks before the indexer could possibly
   * have seen the transaction, and nothing asked again — the placeholder sat
   * under the real reply until the page was reloaded.
   */
  useEffect(() => {
    if (unconfirmed.length === 0) return;
    const timer = setInterval(() => void loadReplies(), 4000);
    return () => clearInterval(timer);
  }, [unconfirmed.length, loadReplies]);

  if (missing) {
    return (
      <main className="shell">
        <Masthead />
        <p className="state">No post with that id.</p>
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

      {/* What this is answering. A reply opened on its own page was a remark
          with nothing to remark on — you could not tell which post it
          belonged to without going back. */}
      {parent && (
        <div className="thread-parent">
          <PostCard item={{ ...parent, score: 0n }} viewer={viewer} />
        </div>
      )}

      {/* The subject of the page, and it is set to read like one — in a feed
          this is one row among many, here it is the reason you are here. */}
      {post ? (
        <div className={`thread-root${parent ? " thread-child" : ""}`}>
          {parent && <p className="thread-label">Replying to the post above</p>}
          {/* score is a feed concern; a permalink has no ranking to report.
              Not openable: this is the page it would open. */}
          <PostCard item={{ ...post, score: 0n }} viewer={viewer} openable={false} />
        </div>
      ) : (
        <p className="state">Loading…</p>
      )}

      {viewer && post && (
        <Composer
          parentId={BigInt(post.id)}
          placeholder="Write a reply"
          author={viewer}
          onPosted={(text) => setPending((p) => [...p, text])}
        />
      )}

      {/* No heading over these. The count is already in the post's own footer,
          the replies are visibly right there, and "No replies yet" was a line
          of type announcing an absence directly under the box inviting
          someone to end it. */}
      {post && (
        <section className="replies">
          <CommentTree
            posts={replies}
            rootId={post.id}
            viewer={viewer}
            sort={sort}
            onSort={setSort}
            onReplied={loadReplies}
          />

          {/* Yours, before the indexer has seen it. */}
          {unconfirmed.map((text) => (
            <PendingPost key={text} text={text} author={viewer} />
          ))}
        </section>
      )}
        </div>
      </div>
    </main>
  );
}
