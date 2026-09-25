import { expect, it } from "vitest";
import { openDb, type Db } from "../src/db";
import { thread } from "../src/queries";

function post(db: Db, id: string, parent: string) {
  db.prepare(
    `INSERT INTO posts (id, author, text, parent_id, created_at, block, log_index)
     VALUES (?,?,?,?,?,?,?)`,
  ).run(id, "0xa1", `text ${id}`, parent, Number(id), 1, 0);
}

it("returns every descendant of a post, and not the post itself", () => {
  const db = openDb(":memory:");
  post(db, "1", "0");
  post(db, "2", "1");
  post(db, "3", "2");
  post(db, "4", "1");
  post(db, "9", "0"); // another root entirely

  expect(thread(db, "1").sort()).toEqual(["2", "3", "4"]);
});

it("is empty for a leaf", () => {
  const db = openDb(":memory:");
  post(db, "1", "0");
  expect(thread(db, "1")).toEqual([]);
});
