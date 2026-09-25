import { beforeEach, describe, expect, it, vi } from "vitest";

type WatchArgs = { onLogs: (logs: unknown[]) => void };

// Typed with its argument, so mockImplementationOnce can read onLogs without
// fighting the inferred zero-arg signature.
const { watchEvent } = vi.hoisted(() => ({
  watchEvent: vi.fn((_args: { onLogs: (logs: unknown[]) => void }) => () => {}),
}));
vi.mock("./chain", () => ({ wsClient: null, publicClient: { watchEvent } }));

import { watchNewPosts } from "./realtime";

describe("watchNewPosts", () => {
  beforeEach(() => watchEvent.mockReset().mockReturnValue(() => {}));

  it("subscribes and returns an unsubscribe function", () => {
    const stop = watchNewPosts(() => {});
    expect(watchEvent).toHaveBeenCalled();
    expect(typeof stop).toBe("function");
    stop();
  });

  it("reports each new post id exactly once", () => {
    let emit: ((logs: unknown[]) => void) | undefined;
    watchEvent.mockImplementationOnce((args: WatchArgs) => {
      emit = args.onLogs;
      return () => {};
    });

    const seen: bigint[] = [];
    watchNewPosts((id) => seen.push(id));
    emit?.([{ args: { id: 7n } }, { args: { id: 8n } }]);
    expect(seen).toEqual([7n, 8n]);
  });

  it("ignores a log with no id rather than throwing", () => {
    let emit: ((logs: unknown[]) => void) | undefined;
    watchEvent.mockImplementationOnce((args: WatchArgs) => {
      emit = args.onLogs;
      return () => {};
    });

    const seen: bigint[] = [];
    watchNewPosts((id) => seen.push(id));
    expect(() => emit?.([{}, { args: {} }, { args: { id: 3n } }])).not.toThrow();
    expect(seen).toEqual([3n]);
  });
});
