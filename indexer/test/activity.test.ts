import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../src/db";
import { activity } from "../src/queries";

let db: Db;

function post(id: string, community: string, block: number, author = "0xa1", parent = "0") {
  db.prepare(
    `INSERT INTO posts (id, author, text, community, parent_id, created_at, block, log_index)
     VALUES (@id, @author, @text, @community, @parent, 100, @block, 0)`,
  ).run({ id, author, text: `post ${id}`, community, parent, block });
}

function like(postId: string, account: string, weight: number) {
  db.prepare(
    "INSERT INTO likes (post_id, account, active, block, log_index, weight) VALUES (?,?,1,1,0,?)",
  ).run(postId, account, weight);
}

beforeEach(() => {
  db = openDb(":memory:");
});

describe("activity", () => {
  it("returns posts in the watched communities, newest first", () => {
    post("1", "cats", 5);
    post("2", "cats", 9);
    post("3", "dogs", 9);
    expect(activity(db, ["cats"], 0).map((a) => a.id)).toEqual(["2", "1"]);
  });

  it("returns only what landed after the cursor", () => {
    post("1", "cats", 5);
    post("2", "cats", 9);
    expect(activity(db, ["cats"], 5).map((a) => a.id)).toEqual(["2"]);
  });

  it("leaves replies out, since a reply is already a notification", () => {
    post("1", "cats", 5);
    post("2", "cats", 6, "0xa1", "1");
    expect(activity(db, ["cats"], 0).map((a) => a.id)).toEqual(["1"]);
  });

  it("sums the weighted likes a post has earned", () => {
    post("1", "cats", 5);
    like("1", "0xb", 100);
    like("1", "0xc", 25);
    expect(activity(db, ["cats"], 0)[0].weightedLikes).toBe(125);
  });

  it("carries the author's handle", () => {
    post("1", "cats", 5, "0xa1");
    db.prepare("INSERT INTO handles (address, handle, metadata_uri) VALUES ('0xa1','alice','')").run();
    expect(activity(db, ["cats"], 0)[0].handle).toBe("alice");
  });

  it("is empty when there is no community to watch", () => {
    post("1", "cats", 5);
    expect(activity(db, [], 0)).toEqual([]);
  });
});
