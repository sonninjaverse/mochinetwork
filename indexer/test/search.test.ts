import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../src/db";
import { searchAccounts } from "../src/queries";

let db: Db;

const ADDR = (n: string) => `0x${n.repeat(40).slice(0, 40)}`;

function account(address: string, handle: string | null, posts = 0) {
  if (handle) {
    db.prepare("INSERT INTO handles (address, handle, metadata_uri) VALUES (?,?,'')").run(
      address,
      handle,
    );
  }
  for (let i = 0; i < posts; i++) {
    db.prepare(
      `INSERT INTO posts (id, author, text, media_uri, parent_id, created_at, block, log_index)
       VALUES (?,?, 't', '', '0', ?, ?, 0)`,
    ).run(`p-${address}-${i}`, address, i + 1, i + 1);
  }
}

beforeEach(() => {
  db = openDb(":memory:");
});

describe("searchAccounts", () => {
  it("matches a name by prefix, the way people type one", () => {
    account(ADDR("a"), "vertexmint");
    account(ADDR("b"), "vertigo");
    account(ADDR("c"), "saltmarket");

    expect(searchAccounts(db, "vert").map((r) => r.handle)).toEqual(["vertigo", "vertexmint"]);
  });

  it("ignores case, because a search box is not a terminal", () => {
    account(ADDR("a"), "vertexmint");
    expect(searchAccounts(db, "VERT")).toHaveLength(1);
  });

  /// A prefix of an address is not a useful thing to search for, and half an
  /// address matching somebody is worse than no match at all.
  it("takes a whole address and not a piece of one", () => {
    account(ADDR("a"), "vertexmint");

    expect(searchAccounts(db, ADDR("a"))[0].handle).toBe("vertexmint");
    expect(searchAccounts(db, "0xaaaa")).toEqual([]);
  });

  it("finds an address that has never posted and has no name", () => {
    const [found] = searchAccounts(db, ADDR("f"));
    expect(found.address).toBe(ADDR("f"));
    expect(found.handle).toBe(null);
    expect(found.posts).toBe(0);
  });

  /// A name shared as a prefix puts the account with more to read first.
  it("puts the busier match first", () => {
    account(ADDR("a"), "mochiteam", 1);
    account(ADDR("b"), "mochifan", 3);

    expect(searchAccounts(db, "mochi").map((r) => r.handle)).toEqual(["mochifan", "mochiteam"]);
  });

  it("counts posts but not replies", () => {
    account(ADDR("a"), "poster");
    const insert = db.prepare(
      `INSERT INTO posts (id, author, text, media_uri, parent_id, created_at, block, log_index)
       VALUES (@id, @a, 't', '', @parent, 1, 1, 0)`,
    );
    insert.run({ id: "1", a: ADDR("a"), parent: "0" });
    insert.run({ id: "2", a: ADDR("a"), parent: "1" });

    expect(searchAccounts(db, "poster")[0].posts).toBe(1);
  });

  it("says nothing for an empty query rather than everything", () => {
    account(ADDR("a"), "vertexmint");
    expect(searchAccounts(db, "")).toEqual([]);
    expect(searchAccounts(db, "   ")).toEqual([]);
  });

  it("caps how much it will return", () => {
    for (let i = 0; i < 30; i++) account(ADDR(String(i % 10)) + i, `name${i}`);
    expect(searchAccounts(db, "name", 5)).toHaveLength(5);
  });
});
