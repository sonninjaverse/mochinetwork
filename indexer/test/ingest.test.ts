import { describe, expect, it, vi } from "vitest";
import { openDb } from "../src/db";
import { backfill, getCursor, setCursor } from "../src/ingest";

function fakeClient(logsByRange: Record<string, unknown[]>) {
  return {
    getLogs: vi.fn(async ({ fromBlock, toBlock }: any) => logsByRange[`${fromBlock}-${toBlock}`] ?? []),
  } as never;
}

const post = (id: number, block: number) => ({
  eventName: "PostCreated",
  args: { id: BigInt(id), author: "0xA1", createdAt: 1700 + id, text: `p${id}` },
  blockNumber: BigInt(block),
  logIndex: 0,
});

describe("backfill", () => {
  it("walks the range in chunks and stores everything", async () => {
    const db = openDb(":memory:");
    const client = fakeClient({ "1-1000": [post(1, 5)], "1001-2000": [post(2, 1500)] });

    await backfill(db, client, 1n, 2000n, 1000);

    expect((db.prepare("SELECT COUNT(*) AS n FROM posts").get() as any).n).toBe(2);
  });

  it("advances the cursor to the last processed block", async () => {
    const db = openDb(":memory:");
    await backfill(db, fakeClient({ "1-1000": [] }), 1n, 1000n, 1000);
    expect(getCursor(db)).toBe(1000);
  });

  /// Restart re-scans a buffer of already-seen blocks. That must be harmless.
  it("produces the same state when the same range is replayed", async () => {
    const db = openDb(":memory:");
    const client = fakeClient({ "1-1000": [post(1, 5)] });

    await backfill(db, client, 1n, 1000n, 1000);
    setCursor(db, 0);
    await backfill(db, client, 1n, 1000n, 1000);

    expect((db.prepare("SELECT COUNT(*) AS n FROM posts").get() as any).n).toBe(1);
  });
});
