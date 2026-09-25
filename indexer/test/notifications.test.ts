import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../src/db";
import { notifications } from "../src/queries";

const ME = "0xme";
const THEM = "0xthem";

let db: Db;

function post(id: string, author: string, parent = "0", block = 1) {
  db.prepare(
    `INSERT INTO posts (id, author, text, media_uri, parent_id, created_at, block, log_index)
     VALUES (@id, @author, @text, '', @parent, 100, @block, 0)`,
  ).run({ id, author, text: `post ${id}`, parent, block });
}

beforeEach(() => {
  db = openDb(":memory:");
  post("1", ME);
});

describe("notifications", () => {
  it("reports a reply to your post", () => {
    post("2", THEM, "1", 5);

    const [n] = notifications(db, ME);
    expect(n.kind).toBe("reply");
    expect(n.actor).toBe(THEM);
    expect(n.postId).toBe("1");
    expect(n.replyId).toBe("2");
    expect(n.text).toBe("post 2");
  });

  it("reports a like and a dislike on your post", () => {
    db.prepare(
      "INSERT INTO likes (post_id, account, active, block, log_index) VALUES ('1', @a, 1, 6, 0)",
    ).run({ a: THEM });
    db.prepare(
      "INSERT INTO dislikes (post_id, account, active, block, log_index) VALUES ('1', '0xx', 1, 7, 0)",
    ).run();

    expect(notifications(db, ME).map((n) => n.kind)).toEqual(["dislike", "like"]);
  });

  /// Being told what you did yourself is noise, not news.
  it("leaves out your own actions", () => {
    post("2", ME, "1", 5); // replying to yourself
    db.prepare(
      "INSERT INTO likes (post_id, account, active, block, log_index) VALUES ('1', @me, 1, 6, 0)",
    ).run({ me: ME });

    expect(notifications(db, ME)).toEqual([]);
  });

  /// A withdrawn vote is not something that happened to you any more.
  it("leaves out a vote that was taken back", () => {
    db.prepare(
      "INSERT INTO likes (post_id, account, active, block, log_index) VALUES ('1', @a, 0, 6, 0)",
    ).run({ a: THEM });

    expect(notifications(db, ME)).toEqual([]);
  });

  it("says nothing about other people's posts", () => {
    post("2", THEM);
    db.prepare(
      "INSERT INTO likes (post_id, account, active, block, log_index) VALUES ('2', '0xx', 1, 6, 0)",
    ).run();

    expect(notifications(db, ME)).toEqual([]);
  });

  it("puts the newest first, across every kind", () => {
    post("2", THEM, "1", 5);
    db.prepare(
      "INSERT INTO likes (post_id, account, active, block, log_index) VALUES ('1', '0xa', 1, 9, 0)",
    ).run();
    db.prepare(
      "INSERT INTO dislikes (post_id, account, active, block, log_index) VALUES ('1', '0xb', 1, 7, 0)",
    ).run();

    expect(notifications(db, ME).map((n) => n.block)).toEqual([9, 7, 5]);
  });

  it("carries the weight of a vote, and none on a reply", () => {
    db.prepare(
      "INSERT INTO likes (post_id, account, active, block, log_index, weight) VALUES ('1', @a, 1, 9, 0, 100)",
    ).run({ a: THEM });
    post("2", THEM, "1", 5);

    const byKind = Object.fromEntries(notifications(db, ME).map((n) => [n.kind, n.weight]));
    expect(byKind.like).toBe(100);
    expect(byKind.reply).toBeNull();
  });

  it("carries the actor's name when they have one", () => {
    post("2", THEM, "1", 5);
    db.prepare("INSERT INTO handles (address, handle, metadata_uri) VALUES (@a, 'them', '')").run({
      a: THEM,
    });

    expect(notifications(db, ME)[0].actorHandle).toBe("them");
  });

  it("matches a checksummed address", () => {
    post("2", THEM, "1", 5);
    expect(notifications(db, "0xME")).toHaveLength(1);
  });
});
