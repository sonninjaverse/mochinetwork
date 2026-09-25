import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PREFS,
  HOT_LIKES,
  loadPrefs,
  noticesFrom,
  savePrefs,
  subLevel,
  unreadNotices,
  voteAllowed,
  watchedCommunities,
  type NotifyPrefs,
} from "./notify";
import type { CommunityActivity, Notification } from "./notifications";

const ME = "0xme";
const THEM = "0xthem";

const prefs = (over: Partial<NotifyPrefs> = {}): NotifyPrefs => ({ ...DEFAULT_PREFS, ...over });

const reply = (block: number, actor = THEM): Notification => ({
  kind: "reply", actor, actorHandle: "them", postId: "1", replyId: "2", text: "hi", block, weight: null,
});
const vote = (kind: "like" | "dislike", weight: number, block = 1): Notification => ({
  kind, actor: THEM, actorHandle: null, postId: "1", replyId: null, text: "post", block, weight,
});
const activity = (
  community: string,
  weightedLikes: number,
  { block = 1, author = THEM } = {},
): CommunityActivity => ({
  id: `${community}-${block}`, community, author, handle: null, text: "hello", block, createdAt: 0, weightedLikes,
});

describe("voteAllowed", () => {
  it("off means off", () => expect(voteAllowed("off", 200)).toBe(false));
  it("all takes any weight", () => expect(voteAllowed("all", 1)).toBe(true));
  it("meaningful takes a whole vote and up", () => {
    expect(voteAllowed("meaningful", 100)).toBe(true);
    expect(voteAllowed("meaningful", 25)).toBe(false);
    expect(voteAllowed("meaningful", null)).toBe(false);
  });
});

describe("subLevel", () => {
  it("defaults to hot until it is set", () => expect(subLevel(prefs(), "cats")).toBe("hot"));
  it("uses what was set", () => {
    expect(subLevel(prefs({ communities: { cats: "all" } }), "cats")).toBe("all");
  });
});

describe("watchedCommunities", () => {
  it("drops the muted ones and keeps the rest", () => {
    const p = prefs({ communities: { cats: "off", dogs: "all" } });
    expect(watchedCommunities(p, ["cats", "dogs", "birds"])).toEqual(["dogs", "birds"]);
  });
});

describe("noticesFrom", () => {
  it("includes a reply by default", () => {
    expect(noticesFrom([reply(5)], [], prefs(), ME)).toHaveLength(1);
  });

  it("drops replies when they are off", () => {
    expect(noticesFrom([reply(5)], [], prefs({ replies: false }), ME)).toEqual([]);
  });

  it("takes only meaningful votes by default", () => {
    const got = noticesFrom([vote("like", 25), vote("like", 100)], [], prefs(), ME);
    expect(got).toHaveLength(1);
    expect(got[0].kind).toBe("like");
  });

  it("takes every vote when asked", () => {
    expect(noticesFrom([vote("like", 1)], [], prefs({ votes: "all" }), ME)).toHaveLength(1);
  });

  it("takes no votes when off", () => {
    expect(noticesFrom([vote("dislike", 200)], [], prefs({ votes: "off" }), ME)).toEqual([]);
  });

  it("tells about a community post only once it is hot, by default", () => {
    const got = noticesFrom([], [activity("cats", HOT_LIKES - 1), activity("cats", HOT_LIKES)], prefs(), ME);
    expect(got).toHaveLength(1);
    expect(got[0].community).toBe("cats");
  });

  it("tells about every community post when the sub is set to all", () => {
    const p = prefs({ communities: { cats: "all" } });
    expect(noticesFrom([], [activity("cats", 0)], p, ME)).toHaveLength(1);
  });

  it("says nothing for a muted community", () => {
    const p = prefs({ communities: { cats: "off" } });
    expect(noticesFrom([], [activity("cats", 999)], p, ME)).toEqual([]);
  });

  it("never notifies you about your own post", () => {
    expect(noticesFrom([], [activity("cats", 999, { author: ME })], prefs(), ME)).toEqual([]);
  });

  it("puts both sources in one order by block", () => {
    const got = noticesFrom([reply(5), vote("like", 100, 9)], [activity("cats", 200, { block: 7 })], prefs(), ME);
    expect(got.map((n) => n.block)).toEqual([9, 7, 5]);
    expect(got.map((n) => n.kind)).toEqual(["like", "post", "reply"]);
  });
});

describe("unreadNotices", () => {
  it("counts what landed after the cursor", () => {
    const items = noticesFrom([reply(5), reply(9)], [], prefs(), ME);
    expect(unreadNotices(items, 5)).toBe(1);
    expect(unreadNotices(items, 10)).toBe(0);
  });
});

describe("prefs storage", () => {
  beforeEach(() => window.localStorage.clear());

  it("starts at the defaults", () => {
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });

  it("round-trips", () => {
    const p = prefs({ replies: false, votes: "all", communities: { cats: "off" } });
    savePrefs(p);
    expect(loadPrefs()).toEqual(p);
  });

  it("repairs a value it cannot trust", () => {
    window.localStorage.setItem("mochi-notify-prefs", JSON.stringify({ votes: "sometimes", replies: "yes" }));
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });
});
