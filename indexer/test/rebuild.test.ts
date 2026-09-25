import { describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "../src/db";
import { backfill } from "../src/ingest";

/// A deterministic fingerprint of everything the indexer holds. Ordering is
/// forced in JS so the hash reflects content, not row order.
function snapshot(db: Db): string {
  return ["posts", "likes", "dislikes", "handles", "communities", "memberships"]
    .map((t) => {
      const rows = db.prepare(`SELECT * FROM ${t}`).all() as Record<string, unknown>[];
      return `${t}:${rows.map((r) => JSON.stringify(r, Object.keys(r).sort())).sort().join("|")}`;
    })
    .join("\n");
}

const LOGS = [
  {
    eventName: "PostCreated",
    args: { id: 1n, author: "0xA1", createdAt: 1700, text: "first" },
    blockNumber: 10n,
    logIndex: 0,
  },
  {
    eventName: "PostCreated",
    args: { id: 2n, author: "0xB2", createdAt: 1701, text: "second" },
    blockNumber: 11n,
    logIndex: 0,
  },
  {
    eventName: "Liked",
    args: { id: 1n, account: "0xB2", weight: 100 },
    blockNumber: 12n,
    logIndex: 0,
  },
  { eventName: "Unliked", args: { id: 1n, account: "0xB2" }, blockNumber: 13n, logIndex: 0 },
];

const client = {
  getLogs: vi.fn(async ({ fromBlock, toBlock }: any) =>
    LOGS.filter((l) => l.blockNumber >= fromBlock && l.blockNumber <= toBlock),
  ),
} as never;

describe("rebuild determinism", () => {
  /**
   * The indexer is a cache, not a source of truth. Deleting it and replaying
   * the chain must land on byte-identical state — otherwise it holds something
   * the chain does not, and every claim about verifiability is weaker for it.
   */
  it("reaches identical state after a full rebuild", async () => {
    const first = openDb(":memory:");
    await backfill(first, client, 1n, 100n, 10);
    const before = snapshot(first);

    const rebuilt = openDb(":memory:");
    await backfill(rebuilt, client, 1n, 100n, 10);

    expect(snapshot(rebuilt)).toBe(before);
    expect(before).toContain("first");
  });

  /// Chunk size is an operational knob. It must not be able to change results.
  /// If anyone adds a running counter to ingest, this is the test that catches
  /// it while every other test stays green.
  it("is independent of chunk size", async () => {
    const big = openDb(":memory:");
    await backfill(big, client, 1n, 100n, 100);

    const small = openDb(":memory:");
    await backfill(small, client, 1n, 100n, 1);

    expect(snapshot(small)).toBe(snapshot(big));
  });

  /// Restart rewinds and replays. Replaying must be a no-op, not a mutation.
  it("is unchanged by replaying a range that was already ingested", async () => {
    const db = openDb(":memory:");
    await backfill(db, client, 1n, 100n, 10);
    const before = snapshot(db);

    await backfill(db, client, 1n, 100n, 10);
    expect(snapshot(db)).toBe(before);
  });
});
