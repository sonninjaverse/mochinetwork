import { describe, expect, it, vi } from "vitest";
import { openDb } from "../src/db";
import { HEARTBEAT_MS, startTail, type TailStatus } from "../src/ingest";
import { createServer } from "../src/server";

function tailClient(head: number, fail = false) {
  return {
    watchEvent: vi.fn(() => () => {}),
    getBlockNumber: vi.fn(async () => {
      if (fail) throw new Error("socket closed");
      return BigInt(head);
    }),
  } as never;
}

const health = async (db: ReturnType<typeof openDb>, tail?: TailStatus) => {
  const res = await createServer(db, undefined, tail).request("/health");
  return res.json() as Promise<Record<string, unknown>>;
};

describe("tail heartbeat", () => {
  it("records a fresh timestamp while the transport answers", async () => {
    vi.useFakeTimers();
    const status: TailStatus = { head: 0, at: 0 };
    const stop = startTail(openDb(":memory:"), tailClient(900), undefined, status);

    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS + 1);
    stop();
    vi.useRealTimers();

    expect(status.head).toBe(900);
    expect(status.at).toBeGreaterThan(0);
  });

  /// A failed poll must not look like a successful one.
  it("leaves the last heartbeat alone when the transport is down", async () => {
    vi.useFakeTimers();
    const status: TailStatus = { head: 0, at: 0 };
    const stop = startTail(openDb(":memory:"), tailClient(900, true), undefined, status);

    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 3);
    stop();
    vi.useRealTimers();

    expect(status.at).toBe(0);
  });

  it("stops beating once the tail is stopped", async () => {
    vi.useFakeTimers();
    const status: TailStatus = { head: 0, at: 0 };
    const client = tailClient(900);
    const stop = startTail(openDb(":memory:"), client, undefined, status);

    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS + 1);
    stop();
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 5);
    vi.useRealTimers();

    expect((client as any).getBlockNumber).toHaveBeenCalledTimes(1);
  });
});

describe("/health", () => {
  /// The whole point: an idle chain leaves the cursor far behind, and that
  /// must not read as a broken indexer. This is the case that stopped a seed
  /// run even though the service was perfectly healthy.
  it("reports live on a quiet chain where the cursor has not moved", async () => {
    const db = openDb(":memory:");
    db.prepare("UPDATE cursor SET last_block = 1000 WHERE id = 1").run();

    const body = await health(db, { head: 99_000, at: Date.now() });

    expect(body.live).toBe(true);
    expect(body.blocksSinceLastEvent).toBe(null); // no chain client in this test
  });

  it("reports not live once the heartbeat goes stale", async () => {
    const body = await health(openDb(":memory:"), {
      head: 99_000,
      at: Date.now() - HEARTBEAT_MS * 10,
    });

    expect(body.live).toBe(false);
    expect(body.tailAgeMs as number).toBeGreaterThan(HEARTBEAT_MS);
  });

  it("reports not live when no tail was ever started", async () => {
    const body = await health(openDb(":memory:"));

    expect(body.live).toBe(false);
    expect(body.tailAgeMs).toBe(null);
  });
});
