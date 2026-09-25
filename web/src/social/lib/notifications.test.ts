import { describe, expect, it } from "vitest";
import { agoFromBlock, unreadCount, type Notification } from "./notifications";

const at = (block: number): Notification => ({
  kind: "like",
  actor: "0xa",
  actorHandle: null,
  postId: "1",
  replyId: null,
  text: null,
  block,
  weight: 100,
});

describe("unreadCount", () => {
  it("counts only what arrived after the marker", () => {
    expect(unreadCount([at(10), at(9), at(8)], 8)).toBe(2);
  });

  it("is zero once caught up", () => {
    expect(unreadCount([at(10)], 10)).toBe(0);
  });

  /// A device that has never looked has everything to read, not nothing.
  it("counts everything when there is no marker", () => {
    expect(unreadCount([at(10), at(9)], 0)).toBe(2);
  });
});

describe("agoFromBlock", () => {
  it("reads as seconds, minutes, hours and days", () => {
    expect(agoFromBlock(1000, 1000)).toBe("0s");
    expect(agoFromBlock(900, 1000)).toBe("40s");
    expect(agoFromBlock(0, 1000)).toBe("6m");
    expect(agoFromBlock(0, 100_000)).toBe("11h");
    expect(agoFromBlock(0, 1_000_000)).toBe("4d");
  });

  /// A head behind the block is a stale head, not a negative age.
  it("never reads as the future", () => {
    expect(agoFromBlock(1000, 900)).toBe("0s");
  });
});
