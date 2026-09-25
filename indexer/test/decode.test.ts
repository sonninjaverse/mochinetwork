import { describe, expect, it } from "vitest";
import { openDb } from "../src/db";
import { applyLog } from "../src/decode";

const base = { blockNumber: 10n, logIndex: 0 };

describe("applyLog", () => {
  it("stores a created post", () => {
    const db = openDb(":memory:");
    applyLog(db, {
      ...base,
      eventName: "PostCreated",
      args: { id: 1n, author: "0xA1", createdAt: 1700, text: "hello" },
    } as never);

    const row = db.prepare("SELECT * FROM posts WHERE id = '1'").get() as any;
    expect(row.text).toBe("hello");
    expect(row.created_at).toBe(1700);
    expect(row.author).toBe("0xa1");
  });

  it("marks a like active and then inactive", () => {
    const db = openDb(":memory:");
    applyLog(db, { ...base, eventName: "Liked", args: { id: 1n, account: "0xA1" } } as never);
    applyLog(db, {
      ...base,
      logIndex: 1,
      eventName: "Unliked",
      args: { id: 1n, account: "0xA1" },
    } as never);

    const row = db.prepare("SELECT active FROM likes WHERE post_id='1'").get() as any;
    expect(row.active).toBe(0);
  });

  /// Replaying a log must not change anything, because restart re-scans a
  /// buffer of blocks it has already seen.
  it("is idempotent when the same log is applied twice", () => {
    const db = openDb(":memory:");
    const log = { ...base, eventName: "Liked", args: { id: 1n, account: "0xA1" } };
    applyLog(db, log as never);
    applyLog(db, log as never);

    const row = db.prepare("SELECT COUNT(*) AS n FROM likes").get() as any;
    expect(row.n).toBe(1);
  });

  it("stores handles, decoding bytes32 back to text", () => {
    const db = openDb(":memory:");
    applyLog(db, {
      ...base,
      eventName: "Registered",
      args: {
        account: "0xA1",
        handle: "0x616c696365000000000000000000000000000000000000000000000000000000",
        metadataURI: "ipfs://x",
      },
    } as never);

    const row = db.prepare("SELECT handle FROM handles WHERE address='0xa1'").get() as any;
    expect(row.handle).toBe("alice");
  });

  it("ignores an unknown event instead of throwing", () => {
    const db = openDb(":memory:");
    expect(() =>
      applyLog(db, { ...base, eventName: "SomethingElse", args: {} } as never),
    ).not.toThrow();
  });

  it("stores a dislike and reverses it", () => {
    const db = openDb(":memory:");
    applyLog(db, { ...base, eventName: "Disliked", args: { id: 1n, account: "0xA1" } } as never);
    let row = db.prepare("SELECT active FROM dislikes").get() as any;
    expect(row.active).toBe(1);

    applyLog(db, {
      ...base,
      logIndex: 1,
      eventName: "Undisliked",
      args: { id: 1n, account: "0xA1" },
    } as never);
    row = db.prepare("SELECT active FROM dislikes").get() as any;
    expect(row.active).toBe(0);
  });

  /// A vote is one direction at a time on chain. The cache has to agree, or a
  /// single voter ends up counted in both columns and every Reddit sort that
  /// reads the pair is wrong.
  it("clears a dislike when the same account likes", () => {
    const db = openDb(":memory:");
    applyLog(db, { ...base, eventName: "Disliked", args: { id: 1n, account: "0xA1" } } as never);
    applyLog(db, {
      ...base,
      logIndex: 1,
      eventName: "Liked",
      args: { id: 1n, account: "0xA1" },
    } as never);

    expect((db.prepare("SELECT active FROM dislikes").get() as any).active).toBe(0);
    expect((db.prepare("SELECT active FROM likes").get() as any).active).toBe(1);
  });

  it("clears a like when the same account dislikes", () => {
    const db = openDb(":memory:");
    applyLog(db, { ...base, eventName: "Liked", args: { id: 1n, account: "0xA1" } } as never);
    applyLog(db, {
      ...base,
      logIndex: 1,
      eventName: "Disliked",
      args: { id: 1n, account: "0xA1" },
    } as never);

    expect((db.prepare("SELECT active FROM likes").get() as any).active).toBe(0);
    expect((db.prepare("SELECT active FROM dislikes").get() as any).active).toBe(1);
  });

  it("keeps the weight the chain put on a like", () => {
    const db = openDb(":memory:");
    applyLog(db, {
      eventName: "Liked",
      args: { id: 1n, account: "0xB2", weight: 60 },
      blockNumber: 10n, logIndex: 0,
    } as any);
    expect((db.prepare("SELECT weight FROM likes").get() as any).weight).toBe(60);
  });

  it("keeps the weight the chain put on a dislike", () => {
    const db = openDb(":memory:");
    applyLog(db, {
      eventName: "Disliked",
      args: { id: 1n, account: "0xB2", weight: 15 },
      blockNumber: 10n, logIndex: 0,
    } as any);
    expect((db.prepare("SELECT weight FROM dislikes").get() as any).weight).toBe(15);
  });

  // Một phiếu bị rút giữ nguyên weight của nó; active = 0 mới là thứ loại nó ra.
  it("leaves the weight in place when a vote is withdrawn", () => {
    const db = openDb(":memory:");
    applyLog(db, { eventName: "Liked", args: { id: 1n, account: "0xB2", weight: 60 }, blockNumber: 10n, logIndex: 0 } as any);
    applyLog(db, { eventName: "Unliked", args: { id: 1n, account: "0xB2" }, blockNumber: 11n, logIndex: 0 } as any);
    const row = db.prepare("SELECT weight, active FROM likes").get() as any;
    expect(row).toEqual({ weight: 60, active: 0 });
  });
});
