import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../src/db";
import { candidates, postsByIds, repliesTo, postByHandleIndex, addressForHandle, postByAuthorIndex, profile, karmaOf } from "../src/queries";

let db: Db;
const NOW = Math.floor(Date.now() / 1000);

function addPost(id: number, createdAt: number, author = "0xa1") {
  db.prepare(
    "INSERT INTO posts (id, author, text, created_at, block, log_index) VALUES (?,?,?,?,?,?)",
  ).run(String(id), author, `post ${id}`, createdAt, id, 0);
}

function addLike(postId: number, account: string, active = 1) {
  db.prepare(
    "INSERT INTO likes (post_id, account, active, block, log_index) VALUES (?,?,?,?,?)",
  ).run(String(postId), account, active, 1, 0);
}

beforeEach(() => {
  db = openDb(":memory:");
});

describe("candidates", () => {
  it("returns newest first for the recent strategy", () => {
    addPost(1, NOW - 100);
    addPost(2, NOW - 10);
    expect(candidates(db, "recent", 10)).toEqual(["2", "1"]);
  });

  it("respects the limit", () => {
    for (let i = 1; i <= 5; i++) addPost(i, NOW - i);
    expect(candidates(db, "recent", 2)).toHaveLength(2);
  });

  /// Old posts carry no community tag and no author name; a feed of them is
  /// not popular anything, so Popular considers only tagged posts.
  it("leaves untagged posts out of the popular strategy", () => {
    addPost(1, NOW - 10);
    db.prepare(
      `INSERT INTO posts (id, author, text, community, created_at, block, log_index)
       VALUES ('2','0xa1','tagged','monad',?,3,0)`,
    ).run(NOW - 5);
    expect(candidates(db, "popular", 10)).toEqual(["2"]);
  });

  it("orders the trending strategy by live like count", () => {
    addPost(1, NOW - 100);
    addPost(2, NOW - 100);
    addLike(2, "0xb1");
    addLike(2, "0xb2");
    addLike(1, "0xb1");
    expect(candidates(db, "trending", 10)[0]).toBe("2");
  });

  it("excludes posts older than the trending window", () => {
    addPost(1, NOW - 60 * 60 * 48);
    addLike(1, "0xb1");
    expect(candidates(db, "trending", 10)).toEqual([]);
  });

  /// The core invariant of this file: an unliked row must stop counting.
  it("does not count inactive likes", () => {
    addPost(1, NOW - 10);
    addLike(1, "0xb1", 0);
    expect(postsByIds(db, ["1"])[0].likeCount).toBe(0);
  });
});

describe("postsByIds", () => {
  it("joins the handle when one exists", () => {
    addPost(1, NOW - 10, "0xa1");
    db.prepare("INSERT INTO handles (address, handle) VALUES (?,?)").run("0xa1", "alice");
    expect(postsByIds(db, ["1"])[0].handle).toBe("alice");
  });

  it("returns a null handle rather than dropping the post", () => {
    addPost(1, NOW - 10, "0xnohandle");
    expect(postsByIds(db, ["1"])[0].handle).toBeNull();
  });

  it("skips ids it does not know", () => {
    addPost(1, NOW - 10);
    expect(postsByIds(db, ["1", "999"])).toHaveLength(1);
  });

  it("returns an empty array for an empty request", () => {
    expect(postsByIds(db, [])).toEqual([]);
  });
});

describe("health", () => {
  /// The cursor only moves when a block holds an event, so on a quiet chain it
  /// trails the head while everything works. Reporting it alone made an idle
  /// indexer indistinguishable from a dead one.
  it("reports reachability separately from the cursor", async () => {
    const { createServer } = await import("../src/server");
    const server = createServer(
      openDb(":memory:"),
      { getBlockNumber: async () => 500n } as never,
    );

    const body = await (await server.fetch(new Request("http://localhost/health"))).json();
    expect(body.reachable).toBe(true);
    expect(body.head).toBe(500);
    expect(body.blocksSinceLastEvent).toBe(500);
  });

  it("reports unreachable rather than a stale number when the chain is down", async () => {
    const { createServer } = await import("../src/server");
    const server = createServer(
      openDb(":memory:"),
      {
        getBlockNumber: async () => {
          throw new Error("down");
        },
      } as never,
    );

    const body = await (await server.fetch(new Request("http://localhost/health"))).json();
    expect(body.reachable).toBe(false);
    expect(body.head).toBeNull();
  });
});

describe("profile", () => {
  it("counts posts and the votes they received", async () => {
    const { profile } = await import("../src/queries");

    addPost(1, NOW - 10, "0xalice");
    addPost(2, NOW - 5, "0xalice");
    addLike(1, "0xbob");
    addLike(2, "0xbob");
    addLike(2, "0xcarol", 0); // undone, must not count

    const p = profile(db, "0xALICE");
    expect(p.posts).toBe(2);
    expect(p.votes).toBe(2);
  });

  it("returns zeroes for an account with no history rather than failing", async () => {
    const { profile } = await import("../src/queries");
    const p = profile(db, "0xnobody");
    expect(p.posts).toBe(0);
    expect(p.handle).toBeNull();
  });

  it("lists an author's posts newest first", async () => {
    const { postsByAuthor } = await import("../src/queries");
    addPost(1, NOW - 100, "0xalice");
    addPost(2, NOW - 10, "0xalice");
    addPost(3, NOW - 5, "0xother");
    expect(postsByAuthor(db, "0xalice", 10)).toEqual(["2", "1"]);
  });

  it("keeps submissions and comments apart", async () => {
    const { postsByAuthor } = await import("../src/queries");
    addPost(1, NOW - 100, "0xalice");
    db.prepare(
      "INSERT INTO posts (id, author, text, parent_id, created_at, block, log_index) VALUES (?,?,?,?,?,?,?)",
    ).run("2", "0xalice", "a reply", "1", NOW - 10, 2, 0);

    expect(postsByAuthor(db, "0xalice", 10, false)).toEqual(["1"]);
    expect(postsByAuthor(db, "0xalice", 10, true)).toEqual(["2"]);
  });
});

/**
 * The client shows a vote optimistically, and once the indexer catches up it
 * has to stop adding that vote on top of totals that already contain it. It
 * cannot know without being told.
 */
describe("postsByIds viewerVote", () => {
  const VIEWER = "0x00000000000000000000000000000000000000a1";

  function seeded() {
    const db = openDb(":memory:");
    db.prepare(
      "INSERT INTO posts (id, author, text, created_at, block, log_index) " +
        "VALUES ('1', '0xb2', 't', 100, 1, 0)",
    ).run();
    return db;
  }

  it("is null when no viewer is given", () => {
    const [post] = postsByIds(seeded(), ["1"]);
    expect(post.viewerVote).toBe(null);
  });

  it("reports an up vote", () => {
    const db = seeded();
    db.prepare(
      "INSERT INTO likes (post_id, account, active, block, log_index) VALUES ('1', @a, 1, 1, 0)",
    ).run({ a: VIEWER });

    expect(postsByIds(db, ["1"], VIEWER)[0].viewerVote).toBe("up");
  });

  it("reports a down vote", () => {
    const db = seeded();
    db.prepare(
      "INSERT INTO dislikes (post_id, account, active, block, log_index) VALUES ('1', @a, 1, 1, 0)",
    ).run({ a: VIEWER });

    expect(postsByIds(db, ["1"], VIEWER)[0].viewerVote).toBe("down");
  });

  it("ignores a withdrawn vote", () => {
    const db = seeded();
    db.prepare(
      "INSERT INTO likes (post_id, account, active, block, log_index) VALUES ('1', @a, 0, 1, 0)",
    ).run({ a: VIEWER });

    expect(postsByIds(db, ["1"], VIEWER)[0].viewerVote).toBe(null);
  });

  /// Someone else's vote is not yours.
  it("does not report another account's vote", () => {
    const db = seeded();
    db.prepare(
      "INSERT INTO likes (post_id, account, active, block, log_index) VALUES ('1', '0xdead', 1, 1, 0)",
    ).run();

    expect(postsByIds(db, ["1"], VIEWER)[0].viewerVote).toBe(null);
  });

  it("matches a differently cased address", () => {
    const db = seeded();
    db.prepare(
      "INSERT INTO likes (post_id, account, active, block, log_index) VALUES ('1', @a, 1, 1, 0)",
    ).run({ a: VIEWER });

    expect(postsByIds(db, ["1"], VIEWER.toUpperCase().replace("0X", "0x"))[0].viewerVote).toBe("up");
  });
});

/**
 * A reply read out of its thread is a fragment, and a ranking contract handed
 * one cannot tell — it would score a reply against posts nobody can see it
 * answering. Every candidate source has to drop them.
 */
describe("replies", () => {
  const VIEWER = "0xaaa";

  function withThread() {
    const db = openDb(":memory:");
    const insert = db.prepare(
      `INSERT INTO posts (id, author, text, media_uri, parent_id, created_at, block, log_index)
       VALUES (@id, @author, @text, '', @parent, @at, 1, 0)`,
    );
    const now = Math.floor(Date.now() / 1000);
    insert.run({ id: "1", author: "0xbbb", text: "root", parent: "0", at: now });
    insert.run({ id: "2", author: "0xccc", text: "a reply", parent: "1", at: now + 1 });
    insert.run({ id: "3", author: "0xccc", text: "another", parent: "1", at: now + 2 });
    insert.run({ id: "4", author: "0xbbb", text: "second root", parent: "0", at: now + 3 });
    return db;
  }

  it("keeps replies out of every candidate source", () => {
    const db = withThread();
    for (const strategy of ["recent", "trending", "joined"] as const) {
      const ids = candidates(db, strategy, 100, VIEWER);
      expect(ids, strategy).not.toContain("2");
      expect(ids, strategy).not.toContain("3");
    }
  });

  it("returns a thread oldest first", () => {
    expect(repliesTo(withThread(), "1")).toEqual(["2", "3"]);
  });

  it("returns nothing for a post with no replies", () => {
    expect(repliesTo(withThread(), "4")).toEqual([]);
  });

  it("reports the reply count and parent on the post itself", () => {
    const [root, reply] = postsByIds(withThread(), ["1", "2"]);
    expect(root.replyCount).toBe(2);
    expect(root.parentId).toBe("0");
    expect(reply.parentId).toBe("1");
    expect(reply.replyCount).toBe(0);
  });

  it("carries a media uri through untouched", () => {
    const db = withThread();
    db.prepare("UPDATE posts SET media_uri = ? WHERE id = '1'").run("ipfs://bafyabc");
    expect(postsByIds(db, ["1"])[0].mediaURI).toBe("ipfs://bafyabc");
  });
});

/**
 * A readable permalink. The number is the author's own count, not the global
 * one — a global id leaks how much the whole network has ever posted and
 * reads as a serial number.
 */
describe("per-author permalinks", () => {
  function withAuthors() {
    const db = openDb(":memory:");
    const insert = db.prepare(
      `INSERT INTO posts (id, author, text, media_uri, parent_id, created_at, block, log_index)
       VALUES (@id, @author, @text, '', '0', @at, 1, 0)`,
    );
    insert.run({ id: "1", author: "0xaaa", text: "alice one", at: 100 });
    insert.run({ id: "2", author: "0xbbb", text: "bob one", at: 101 });
    insert.run({ id: "3", author: "0xaaa", text: "alice two", at: 102 });
    db.prepare("INSERT INTO handles (address, handle, metadata_uri) VALUES (?,?,'')").run(
      "0xaaa",
      "alice",
    );
    return db;
  }

  it("numbers each author's posts from one", () => {
    const [a1, b1, a2] = postsByIds(withAuthors(), ["1", "2", "3"]);
    expect(a1.authorIndex).toBe(1);
    expect(b1.authorIndex).toBe(1); // bob's first, not the network's second
    expect(a2.authorIndex).toBe(2);
  });

  it("resolves a handle and index back to the post", () => {
    const db = withAuthors();
    expect(postByHandleIndex(db, "alice", 1)).toBe("1");
    expect(postByHandleIndex(db, "alice", 2)).toBe("3");
  });

  it("is case insensitive, because a url is", () => {
    expect(postByHandleIndex(withAuthors(), "ALICE", 1)).toBe("1");
  });

  it("returns nothing past the end, or for a name nobody holds", () => {
    const db = withAuthors();
    expect(postByHandleIndex(db, "alice", 9)).toBe(null);
    expect(postByHandleIndex(db, "nobody", 1)).toBe(null);
  });

  it("resolves a handle to its address", () => {
    expect(addressForHandle(withAuthors(), "alice")).toBe("0xaaa");
    expect(addressForHandle(withAuthors(), "nobody")).toBe(null);
  });

  /// A reply is one of your posts too, so it has a number like any other.
  it("counts replies in the author's own sequence", () => {
    const db = withAuthors();
    db.prepare(
      `INSERT INTO posts (id, author, text, media_uri, parent_id, created_at, block, log_index)
       VALUES ('4', '0xaaa', 'a reply', '', '2', 103, 1, 0)`,
    ).run();
    expect(postsByIds(db, ["4"])[0].authorIndex).toBe(3);
  });
});

/**
 * The permalink that cannot drift. A handle changes hands; an address is the
 * account itself, so a link written today means the same post forever.
 */
describe("postByAuthorIndex", () => {
  function withPosts() {
    const db = openDb(":memory:");
    const insert = db.prepare(
      `INSERT INTO posts (id, author, text, media_uri, parent_id, created_at, block, log_index)
       VALUES (@id, @author, @text, '', '0', @at, 1, 0)`,
    );
    insert.run({ id: "1", author: "0xaaa", text: "one", at: 100 });
    insert.run({ id: "2", author: "0xbbb", text: "theirs", at: 101 });
    insert.run({ id: "3", author: "0xaaa", text: "two", at: 102 });
    return db;
  }

  it("counts only that account's posts", () => {
    const db = withPosts();
    expect(postByAuthorIndex(db, "0xaaa", 1)).toBe("1");
    expect(postByAuthorIndex(db, "0xaaa", 2)).toBe("3");
    expect(postByAuthorIndex(db, "0xbbb", 1)).toBe("2");
  });

  it("matches a checksummed address, because a url carries either", () => {
    expect(postByAuthorIndex(withPosts(), "0xAAA", 1)).toBe("1");
  });

  it("returns nothing past the end or for an account with none", () => {
    const db = withPosts();
    expect(postByAuthorIndex(db, "0xaaa", 9)).toBe(null);
    expect(postByAuthorIndex(db, "0xccc", 1)).toBe(null);
  });
});

/**
 * Counting only likes was left over from a version with no downvotes. A post
 * can be voted both ways now, and half the picture flatters everyone equally.
 */
describe("profile votes", () => {
  it("nets downvotes against upvotes", () => {
    const db = openDb(":memory:");
    db.prepare(
      `INSERT INTO posts (id, author, text, media_uri, parent_id, created_at, block, log_index)
       VALUES ('1', '0xme', 't', '', '0', 1, 1, 0)`,
    ).run();
    for (const who of ["0xa", "0xb", "0xc"]) {
      db.prepare(
        "INSERT INTO likes (post_id, account, active, block, log_index) VALUES ('1', ?, 1, 1, 0)",
      ).run(who);
    }
    db.prepare(
      "INSERT INTO dislikes (post_id, account, active, block, log_index) VALUES ('1', '0xd', 1, 1, 0)",
    ).run();

    expect(profile(db, "0xme").votes).toBe(2);
  });

  it("can go negative, because the number is the truth and not a score", () => {
    const db = openDb(":memory:");
    db.prepare(
      `INSERT INTO posts (id, author, text, media_uri, parent_id, created_at, block, log_index)
       VALUES ('1', '0xme', 't', '', '0', 1, 1, 0)`,
    ).run();
    db.prepare(
      "INSERT INTO dislikes (post_id, account, active, block, log_index) VALUES ('1', '0xd', 1, 1, 0)",
    ).run();

    expect(profile(db, "0xme").votes).toBe(-1);
  });
});

describe("karmaOf", () => {
  /// alice đăng bài 1 (top-level) và bài 2 (reply). bob vote.
  function karmaDb() {
    const db = openDb(":memory:");
    db.exec(`
      INSERT INTO posts (id, author, text, media_uri, parent_id, created_at, block, log_index) VALUES ('1','0xa1','post','', '0', 1700, 10, 0);
      INSERT INTO posts (id, author, text, media_uri, parent_id, created_at, block, log_index) VALUES ('2','0xa1','reply','', '1', 1701, 11, 0);
    `);
    return db;
  }

  const like = (db: any, id: string, account: string, weight: number) =>
    db.prepare("INSERT INTO likes VALUES (?,?,1,10,0,?)").run(id, account, weight);

  it("splits post karma from comment karma", () => {
    const db = karmaDb();
    like(db, "1", "0xb2", 100);
    like(db, "2", "0xb2", 100);
    expect(karmaOf(db, "0xa1")).toEqual({ post: 100, comment: 100 });
  });

  // Một phiếu trọng số 0 không đóng góp gì, dù nó có được đếm là một phiếu.
  it("counts nothing for a zero-weight vote", () => {
    const db = karmaDb();
    like(db, "1", "0xsybil", 0);
    expect(karmaOf(db, "0xa1").post).toBe(0);
  });

  // PostRegistry chặn tự vote, và indexer cũng loại phòng khi có dữ liệu cũ.
  it("ignores a vote the author cast on their own post", () => {
    const db = karmaDb();
    like(db, "1", "0xa1", 100);
    expect(karmaOf(db, "0xa1").post).toBe(0);
  });

  // Karma ở đúng đơn vị của chain: 100 điểm là một phiếu trọn vẹn, và các
  // phiếu nhỏ hơn cộng dồn chứ không bị làm tròn về 0.
  it("sums weighted votes in the chain's units", () => {
    const db = karmaDb();
    like(db, "1", "0xb2", 60);
    like(db, "1", "0xc3", 60);
    expect(karmaOf(db, "0xa1").post).toBe(120);
  });

  it("subtracts dislikes", () => {
    const db = karmaDb();
    like(db, "1", "0xb2", 100);
    db.prepare("INSERT INTO dislikes VALUES ('1','0xc3',1,10,0,100)").run();
    expect(karmaOf(db, "0xa1").post).toBe(0);
  });

  it("ignores a vote that was withdrawn", () => {
    const db = karmaDb();
    db.prepare("INSERT INTO likes VALUES ('1','0xb2',0,10,0,100)").run();
    expect(karmaOf(db, "0xa1").post).toBe(0);
  });
});
