import { describe, expect, it } from "vitest";
import { migrate, openDb } from "../src/db";

describe("schema", () => {
  it("creates every table", () => {
    const db = openDb(":memory:");
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name);
    expect(names).toEqual(["communities", "cursor", "dislikes", "handles", "indexed_sources", "invite_challenges", "invite_codes", "invite_members", "invite_meta", "invite_sessions", "likes", "memberships", "posts", "push_subscriptions"]);
  });

  it("starts the cursor at block zero", () => {
    const db = openDb(":memory:");
    const row = db.prepare("SELECT last_block FROM cursor WHERE id = 1").get() as any;
    expect(row.last_block).toBe(0);
  });

  it("rejects a second post with the same id", () => {
    const db = openDb(":memory:");
    const insert = db.prepare(
      "INSERT OR IGNORE INTO posts (id, author, text, created_at, block, log_index) VALUES (?,?,?,?,?,?)",
    );
    insert.run("1", "0xa", "hello", 100, 1, 0);
    insert.run("1", "0xb", "different", 200, 2, 0);
    const row = db.prepare("SELECT author FROM posts WHERE id = '1'").get() as any;
    expect(row.author).toBe("0xa");
  });

  it("is idempotent for the same like applied twice", () => {
    const db = openDb(":memory:");
    const insert = db.prepare(
      "INSERT INTO likes (post_id, account, active, block, log_index) VALUES (?,?,?,?,?) " +
        "ON CONFLICT(post_id, account) DO UPDATE SET active = excluded.active",
    );
    insert.run("1", "0xa", 1, 5, 0);
    insert.run("1", "0xa", 1, 5, 0);
    const row = db.prepare("SELECT COUNT(*) AS n FROM likes").get() as any;
    expect(row.n).toBe(1);
  });

  // DB testnet không được phép xóa để đổi schema.
  it("adds the weight columns to a database that predates them", () => {
    const db = openDb(":memory:");
    db.exec("DROP TABLE likes");
    db.exec(`CREATE TABLE likes (
      post_id TEXT NOT NULL, account TEXT NOT NULL, active INTEGER NOT NULL,
      block INTEGER NOT NULL, log_index INTEGER NOT NULL, PRIMARY KEY (post_id, account))`);

    migrate(db);

    const cols = db.prepare("PRAGMA table_info(likes)").all() as any[];
    expect(cols.some((c) => c.name === "weight")).toBe(true);
  });

  // A freshly-created database and a migrated one must end up with identical
  // column order — a later task inserts test rows positionally, so where
  // ALTER TABLE appends weight has to match where CREATE TABLE puts it.
  it("puts weight in the same column position whether the table is fresh or migrated", () => {
    const fresh = openDb(":memory:");
    const freshCols = (fresh.prepare("PRAGMA table_info(likes)").all() as any[]).map(
      (c) => c.name,
    );

    const migrated = openDb(":memory:");
    migrated.exec("DROP TABLE likes");
    migrated.exec(`CREATE TABLE likes (
      post_id TEXT NOT NULL, account TEXT NOT NULL, active INTEGER NOT NULL,
      block INTEGER NOT NULL, log_index INTEGER NOT NULL, PRIMARY KEY (post_id, account))`);
    migrate(migrated);
    const migratedCols = (migrated.prepare("PRAGMA table_info(likes)").all() as any[]).map(
      (c) => c.name,
    );

    expect(migratedCols).toEqual(freshCols);
  });
});
