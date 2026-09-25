import type { Db } from "./db";

export type IndexedPost = {
  id: string;
  author: string;
  handle: string | null;
  text: string;
  createdAt: number;
  likeCount: number;
  dislikeCount: number;
  /** "" when the post has no image. A content address, not a fetched URL. */
  mediaURI: string;
  /** "0" for a top-level post, else the post this replies to. */
  parentId: string;
  replyCount: number;
  /** 1-based position among this author's posts. Stable: ids only ever grow. */
  authorIndex: number;
  /** "up", "down", or null when there is no viewer or no vote. */
  viewerVote?: "up" | "down" | null;
  /**
   * Post karma plus comment karma, summed: PostCard has room for only one
   * number next to the author's name.
   */
  authorKarma: number;
  community: string;
};

const TRENDING_WINDOW_SECONDS = 24 * 60 * 60;

export type Strategy = "recent" | "popular" | "trending" | "community" | "joined";

export const STRATEGIES: readonly Strategy[] = [
  "recent",
  "popular",
  "trending",
  "community",
  "joined",
] as const;

export function isStrategy(value: unknown): value is Strategy {
  return typeof value === "string" && (STRATEGIES as readonly string[]).includes(value);
}

export type CommunitySummary = {
  name: string;
  creator: string;
  metadataURI: string;
  createdAt: number;
  memberCount: number;
  postCount: number;
  joined: boolean;
};

export function communities(db: Db, viewer?: string, query = "", limit = 100, offset = 0): CommunitySummary[] {
  const rows = db.prepare(`SELECT c.name, c.creator, c.metadata_uri AS metadataURI,
    c.created_at AS createdAt,
    (SELECT COUNT(*) FROM memberships m WHERE m.name = c.name AND m.active = 1) AS memberCount,
    (SELECT COUNT(*) FROM posts p WHERE p.community = c.name AND p.parent_id = '0') AS postCount,
    EXISTS(SELECT 1 FROM memberships m WHERE m.name = c.name AND m.account = @viewer AND m.active = 1) AS joined
    FROM communities c WHERE substr(c.name, 1, length(@q)) = @q
    ORDER BY c.name LIMIT @limit OFFSET @offset`)
    .all({ viewer: viewer?.toLowerCase() ?? null, q: query.toLowerCase(),
      limit: Math.min(100, Math.max(1, Number.isFinite(limit) ? Math.trunc(limit) : 100)),
      offset: Math.max(0, Number.isFinite(offset) ? Math.trunc(offset) : 0) }) as (Omit<CommunitySummary, "joined"> & { joined: number })[];
  return rows.map(r => ({ ...r, joined: Boolean(r.joined) }));
}

export function communityOf(db: Db, name: string, viewer?: string): CommunitySummary | null {
  return communities(db, viewer, name, 100).find(c => c.name === name.toLowerCase()) ?? null;
}

/**
 * Picks which posts a ranking contract will consider. This is the indexer's
 * only influence on the feed, and it is deliberately kept dumb and public:
 * two strategies, no secret weighting, no personalisation. Scoring is on chain.
 *
 * Replies are excluded from all three. A reply read out of its thread is a
 * fragment, and a ranking contract handed one has no way to tell — it would
 * score "agreed" against a post nobody in the feed can see.
 */
export function candidates(
  db: Db,
  strategy: Strategy,
  limit: number,
  viewer?: string,
  community?: string,
): string[] {
  const capped = Math.min(Math.max(Number.isFinite(limit) ? Math.trunc(limit) : 500, 1), 1000);

  if (strategy === "community") {
    if (!community) return [];
    return db.prepare(`SELECT id FROM posts WHERE community = ? AND parent_id = '0'
      ORDER BY created_at DESC, CAST(id AS INTEGER) DESC LIMIT ?`)
      .all(community.toLowerCase(), capped).map((r: any) => r.id);
  }
  if (strategy === "joined") {
    if (!viewer) return [];
    return db.prepare(`SELECT p.id FROM posts p JOIN memberships m ON m.name = p.community
      WHERE m.account = ? AND m.active = 1 AND p.parent_id = '0'
      ORDER BY p.created_at DESC, CAST(p.id AS INTEGER) DESC LIMIT ?`)
      .all(viewer.toLowerCase(), capped).map((r: any) => r.id);
  }

  // Every post that belongs to a community, the pool Popular ranks. Posts
  // written before communities existed carry no tag and are left out: a feed
  // of nameless addresses and untagged text is not what anyone means by
  // popular, and the posts themselves are immutable, so the filter is the only
  // honest way to leave them out of this one feed.
  if (strategy === "popular") {
    return db.prepare(`SELECT id FROM posts WHERE parent_id = '0' AND community != ''
      ORDER BY created_at DESC, CAST(id AS INTEGER) DESC LIMIT ?`)
      .all(capped).map((r: any) => r.id);
  }

  if (strategy === "trending") {
    const since = Math.floor(Date.now() / 1000) - TRENDING_WINDOW_SECONDS;
    return db
      .prepare(
        `SELECT p.id AS id
         FROM posts p
         LEFT JOIN likes l ON l.post_id = p.id AND l.active = 1
         WHERE p.created_at >= ? AND p.parent_id = '0' 
         GROUP BY p.id
         ORDER BY COUNT(l.account) DESC, p.created_at DESC
         LIMIT ?`,
      )
      .all(since, capped)
      .map((r: any) => r.id);
  }

  return db
    .prepare(
      `SELECT id FROM posts WHERE parent_id = '0'
       ORDER BY created_at DESC, CAST(id AS INTEGER) DESC LIMIT ?`,
    )
    .all(capped)
    .map((r: any) => r.id);
}

/**
 * Reports each post's counts and, when a viewer is given, how that viewer has
 * already voted.
 *
 * The client cannot work the last part out for itself. Without it a vote cast
 * a moment ago is counted twice — once in the totals the indexer now returns,
 * once in the client's own optimistic adjustment — and a reload loses the
 * highlight on the arrow you pressed.
 */
export function postsByIds(db: Db, ids: string[], viewer?: string): IndexedPost[] {
  if (ids.length === 0) return [];

  // Named parameters throughout: better-sqlite3 counts a repeated positional
  // placeholder as a separate binding, and the viewer appears four times.
  const params: Record<string, string | null> = { viewer: viewer?.toLowerCase() ?? null };
  const placeholders = ids.map((id, i) => {
    params[`id${i}`] = id;
    return `@id${i}`;
  });

  const posts = db
    .prepare(
      `SELECT
         p.id         AS id,
         p.community  AS community,
         p.author     AS author,
         h.handle     AS handle,
         p.text       AS text,
         p.created_at AS createdAt,
         p.media_uri  AS mediaURI,
         p.parent_id  AS parentId,
         (SELECT COUNT(*) FROM posts r WHERE r.parent_id = p.id) AS replyCount,
         -- Which of this author's posts this is. Derived rather than stored:
         -- the chain has one global counter, and a per-author number is a
         -- presentation concern that must not cost a storage slot.
         (SELECT COUNT(*) FROM posts e
          WHERE e.author = p.author AND CAST(e.id AS INTEGER) <= CAST(p.id AS INTEGER))
           AS authorIndex,
         (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id AND l.active = 1) AS likeCount,
         (SELECT COUNT(*) FROM dislikes d WHERE d.post_id = p.id AND d.active = 1) AS dislikeCount,
         CASE
           WHEN @viewer IS NULL THEN NULL
           WHEN EXISTS (SELECT 1 FROM likes l
                        WHERE l.post_id = p.id AND l.account = @viewer AND l.active = 1) THEN 'up'
           WHEN EXISTS (SELECT 1 FROM dislikes d
                        WHERE d.post_id = p.id AND d.account = @viewer AND d.active = 1) THEN 'down'
           ELSE NULL
         END AS viewerVote
       FROM posts p
       LEFT JOIN handles h ON h.address = p.author
       WHERE p.id IN (${placeholders.join(",")})`,
    )
    .all(params) as Omit<IndexedPost, "authorKarma">[];

  // One karmaOf call per distinct author, not per post: a feed of 500 posts
  // by 30 people costs 30 karma reads, not 500.
  const karmaByAuthor = new Map<string, number>();
  for (const author of new Set(posts.map((p) => p.author))) {
    const karma = karmaOf(db, author);
    karmaByAuthor.set(author, karma.post + karma.comment);
  }

  return posts.map((p) => ({ ...p, authorKarma: karmaByAuthor.get(p.author) ?? 0 }));
}

/**
 * Every descendant of one post, flattened, so a whole thread arrives in one
 * request rather than one per level. The client rebuilds the tree from the
 * parentId it already gets with each post.
 */
export function thread(db: Db, root: string, limit = 2000): string[] {
  return db
    .prepare(
      `WITH RECURSIVE tree(id) AS (
         SELECT id FROM posts WHERE parent_id = @root
         UNION ALL
         SELECT p.id FROM posts p JOIN tree t ON p.parent_id = t.id
       )
       SELECT id FROM tree LIMIT @limit`,
    )
    .all({ root, limit: Math.min(Math.max(limit, 1), 2000) })
    .map((r: any) => r.id);
}

/**
 * Replies to one post, oldest first.
 *
 * Not ranked. A conversation reads in the order it happened, and handing this
 * to a ranking contract would reorder an argument into a scoreboard.
 */
export function repliesTo(db: Db, id: string, limit = 200): string[] {
  return db
    .prepare(
      `SELECT id FROM posts WHERE parent_id = @id
       ORDER BY created_at ASC, CAST(id AS INTEGER) ASC LIMIT @limit`,
    )
    .all({ id, limit: Math.min(Math.max(limit, 1), 500) })
    .map((r: any) => r.id);
}

/**
 * The id of an author's nth post, addressed by handle.
 *
 * Handles are mutable and released on rename, so this resolves whoever holds
 * the name *now* — a link outlives the name it was written with only by
 * accident. /posts by id is the address that cannot drift.
 */
export function postByHandleIndex(db: Db, handle: string, n: number): string | null {
  const row = db
    .prepare(
      `SELECT p.id AS id
       FROM posts p
       JOIN handles h ON h.address = p.author
       WHERE h.handle = @handle
       ORDER BY CAST(p.id AS INTEGER) ASC
       LIMIT 1 OFFSET @offset`,
    )
    .get({ handle: handle.toLowerCase(), offset: Math.max(n - 1, 0) }) as { id: string } | undefined;
  return row?.id ?? null;
}

/**
 * The id of an author's nth post, addressed by account.
 *
 * This is the one that cannot drift. A handle changes hands; an address is
 * the account, so a link written today means the same post forever.
 */
export function postByAuthorIndex(db: Db, address: string, n: number): string | null {
  const row = db
    .prepare(
      `SELECT id FROM posts
       WHERE author = @author
       ORDER BY CAST(id AS INTEGER) ASC
       LIMIT 1 OFFSET @offset`,
    )
    .get({ author: address.toLowerCase(), offset: Math.max(n - 1, 0) }) as
    | { id: string }
    | undefined;
  return row?.id ?? null;
}

/** The address behind a handle, or null. */
export function addressForHandle(db: Db, handle: string): string | null {
  const row = db
    .prepare("SELECT address FROM handles WHERE handle = @handle")
    .get({ handle: handle.toLowerCase() }) as { address: string } | undefined;
  return row?.address ?? null;
}

export type Found = {
  address: string;
  handle: string | null;
  posts: number;
};

/**
 * Finds an account by name or by address.
 *
 * An address is looked up whole: a prefix of one is not a useful thing to
 * search for, and half an address matching somebody is worse than no match.
 * A name is matched by prefix, because that is how people type one.
 *
 * Ordered by how much they have written, so a name shared as a prefix by
 * several accounts puts the busier one first. Nothing here is ranked on
 * chain — this is a lookup, not a feed.
 */
export function searchAccounts(db: Db, query: string, limit = 8): Found[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];

  const columns = `
    a.address AS address,
    h.handle  AS handle,
    (SELECT COUNT(*) FROM posts p WHERE p.author = a.address AND p.parent_id = '0') AS posts`;

  // A whole address, whether or not anyone has ever posted from it.
  if (/^0x[0-9a-f]{40}$/.test(q)) {
    return db
      .prepare(
        `SELECT ${columns}
         FROM (SELECT @q AS address) a
         LEFT JOIN handles h ON h.address = a.address`,
      )
      .all({ q }) as Found[];
  }

  return db
    .prepare(
      `SELECT ${columns}
       FROM handles h
       JOIN (SELECT address FROM handles) a ON a.address = h.address
       WHERE h.handle LIKE @prefix
       ORDER BY posts DESC, LENGTH(h.handle) ASC, h.handle ASC
       LIMIT @limit`,
    )
    .all({ prefix: `${q}%`, limit: Math.min(Math.max(limit, 1), 25) }) as Found[];
}

export type Notification = {
  kind: "reply" | "like" | "dislike";
  /** Who did it. */
  actor: string;
  actorHandle: string | null;
  /** The post it happened to. */
  postId: string | null;
  /** The reply itself, for a reply. Where the link should go. */
  replyId: string | null;
  text: string | null;
  block: number;
  /** The vote's weight, on like/dislike; null for a reply. */
  weight: number | null;
};

/**
 * What has happened to you, newest first.
 *
 * Derived from what the indexer already holds rather than stored: a
 * notification is a view of the chain, not a new fact, and writing it down
 * would mean a second thing that can disagree with it.
 *
 * Ordered by block. Likes and follows carry no timestamp — the contract emits
 * one only for a post, because only a post's age is ranked on — so the client
 * estimates elapsed time from block height. Ordering is exact; the clock is
 * approximate, which is the right way round for a list nobody reads for
 * seconds.
 *
 * Your own actions are excluded. Being told you liked something is noise.
 */
export function notifications(db: Db, address: string, limit = 50): Notification[] {
  const me = address.toLowerCase();

  return db
    .prepare(
      `SELECT * FROM (
         SELECT 'reply' AS kind, r.author AS actor, r.parent_id AS postId,
                r.id AS replyId, r.text AS text, r.block AS block, NULL AS weight
         FROM posts r
         JOIN posts parent ON parent.id = r.parent_id
         WHERE parent.author = @me AND r.author <> @me AND r.parent_id <> '0'

         UNION ALL
         SELECT 'like', l.account, l.post_id, NULL, p.text, l.block, l.weight
         FROM likes l JOIN posts p ON p.id = l.post_id
         WHERE p.author = @me AND l.account <> @me AND l.active = 1

         UNION ALL
         SELECT 'dislike', d.account, d.post_id, NULL, p.text, d.block, d.weight
         FROM dislikes d JOIN posts p ON p.id = d.post_id
         WHERE p.author = @me AND d.account <> @me AND d.active = 1
       )
       ORDER BY block DESC
       LIMIT @limit`,
    )
    .all({ me, limit: Math.min(Math.max(limit, 1), 200) })
    .map((r: any) => ({
      ...r,
      actorHandle:
        (
          db.prepare("SELECT handle FROM handles WHERE address = ?").get(r.actor) as
            | { handle: string }
            | undefined
        )?.handle ?? null,
    })) as Notification[];
}

export type CommunityActivity = {
  id: string;
  community: string;
  author: string;
  handle: string | null;
  text: string;
  block: number;
  createdAt: number;
  /** Weighted likes, on the same 100-point scale karma uses. */
  weightedLikes: number;
};

/**
 * Recent top-level posts in the given communities, newest first.
 *
 * The client decides what to do with them — a community it watches for every
 * post, one it watches only for posts that have earned a whole vote, or one it
 * has muted — so this stays a plain read and carries no preference of its own.
 */
export function activity(
  db: Db,
  communities: string[],
  since: number,
  limit = 100,
): CommunityActivity[] {
  const names = [...new Set(communities.map((c) => c.toLowerCase()).filter(Boolean))];
  if (names.length === 0) return [];
  const marks = names.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT p.id, p.community, p.author, h.handle AS handle, p.text,
              p.block, p.created_at AS createdAt,
              COALESCE((SELECT SUM(l.weight) FROM likes l
                        WHERE l.post_id = p.id AND l.active = 1), 0) AS weightedLikes
       FROM posts p
       LEFT JOIN handles h ON h.address = p.author
       WHERE p.parent_id = '0' AND p.block > ? AND p.community IN (${marks})
       ORDER BY p.block DESC, CAST(p.id AS INTEGER) DESC
       LIMIT ?`,
    )
    .all(Math.max(0, Math.trunc(since)), ...names, Math.min(Math.max(limit, 1), 200)) as CommunityActivity[];
}

/**
 * Reputation, in the same points PostRegistry.karmaOf holds on chain: 100
 * points is one whole vote. The chain is the source of truth and the client
 * reads it there; this is the indexer's cache of the same number, summed from
 * the weights the Liked and Disliked events carried.
 *
 * Weighted, not raw: a vote is worth whatever the voter's own karma made it
 * worth when it landed, so an account the room has downvoted can no longer
 * shout as loudly as one it agrees with.
 *
 * Self-votes cannot appear at all — PostRegistry rejects them — so they are
 * not subtracted here either.
 */
export function karmaOf(db: Db, address: string): { post: number; comment: number } {
  // Named rather than the numbered ?1/?2 style: the address appears twice per
  // query, and better-sqlite3 counts a repeated numbered placeholder as a
  // separate binding and rejects the call as under-supplied.
  const of = (replies: boolean) => {
    const row = db
      .prepare(
        `SELECT
           COALESCE((SELECT SUM(l.weight) FROM likes l JOIN posts p ON p.id = l.post_id
                     WHERE p.author = @a AND l.active = 1 AND l.account != @a
                       AND (p.parent_id != '0') = @replies), 0)
         - COALESCE((SELECT SUM(d.weight) FROM dislikes d JOIN posts p ON p.id = d.post_id
                     WHERE p.author = @a AND d.active = 1 AND d.account != @a
                       AND (p.parent_id != '0') = @replies), 0) AS net`,
      )
      .get({ a: address.toLowerCase(), replies: replies ? 1 : 0 }) as { net: number };
    return row.net;
  };

  return { post: of(false), comment: of(true) };
}

export type Profile = {
  address: string;
  handle: string | null;
  /** Top-level submissions only, the way a Reddit profile counts Posts. */
  posts: number;
  /** Replies, the way a Reddit profile counts Comments. */
  comments: number;
  /**
   * Unix seconds of this account's earliest post, shown as a cake day.
   *
   * Not literally a registration time: the registry's Registered event carries
   * a block, not a clock, and the old schema kept neither. First activity is
   * derived from what is here and never wrong by more than the gap between
   * registering a name and using it. Null for an account that has not posted.
   */
  joined: number | null;
  /**
   * Upvotes minus downvotes across everything this account has written.
   *
   * Counting only likes was left over from a version that had no downvotes. A
   * post can be voted both ways now, and reporting half of that flatters
   * everyone equally — which is the same as reporting nothing.
   */
  votes: number;
  /** Weighted karma from this account's top-level posts. See karmaOf. */
  postKarma: number;
  /** Weighted karma from this account's replies. See karmaOf. */
  commentKarma: number;
};

/**
 * Everything the indexer knows about one account.
 *
 * Deliberately excludes karma and weight: those live on chain and the client
 * reads them there. A reputation score that arrived through an indexer would
 * be a reputation score you have to trust the indexer for.
 */
export function profile(db: Db, address: string): Profile {
  const a = address.toLowerCase();

  // Named rather than positional: the address appears many times, and
  // better-sqlite3 counts repeated ? placeholders as separate bindings.
  const row = db
    .prepare(
      `SELECT
         (SELECT handle FROM handles WHERE address = @a) AS handle,
         (SELECT COUNT(*) FROM posts WHERE author = @a AND parent_id = '0') AS posts,
         (SELECT COUNT(*) FROM posts WHERE author = @a AND parent_id != '0') AS comments,
         (SELECT MIN(created_at) FROM posts WHERE author = @a) AS joined,
         (SELECT COUNT(*) FROM likes l JOIN posts p ON p.id = l.post_id
           WHERE p.author = @a AND l.active = 1)
         - (SELECT COUNT(*) FROM dislikes d JOIN posts p ON p.id = d.post_id
             WHERE p.author = @a AND d.active = 1) AS votes`,
    )
    .get({ a }) as Omit<Profile, "address" | "postKarma" | "commentKarma">;

  const karma = karmaOf(db, a);
  return { address: a, ...row, postKarma: karma.post, commentKarma: karma.comment };
}

/**
 * Ids by one author, newest first. `replies` selects their comments instead of
 * their submissions, which is the Posts/Comments split on a Reddit profile.
 */
export function postsByAuthor(db: Db, address: string, limit: number, replies = false): string[] {
  return db
    .prepare(
      `SELECT id FROM posts WHERE author = ? AND (parent_id != '0') = ?
       ORDER BY created_at DESC, CAST(id AS INTEGER) DESC LIMIT ?`,
    )
    .all(address.toLowerCase(), replies ? 1 : 0, Math.min(Math.max(limit, 1), 200))
    .map((r: any) => r.id);
}
