import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../src/db";
import {
  MEANINGFUL_WEIGHT,
  recipients,
  removeSubscription,
  saveSubscription,
  subLevel,
  syncPrefs,
  wantsReply,
  wantsVote,
  type PushPrefs,
  type Row,
} from "../src/push";

const A = "0xaaaa";
const B = "0xbbbb";
const C = "0xcccc";

let db: Db;

function post(id: string, author: string, community: string, parent = "0", text = `post ${id}`) {
  db.prepare(
    `INSERT INTO posts (id, author, text, media_uri, parent_id, created_at, block, log_index, community)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(id, author, text, "", parent, 1, 1, 0, community);
}

const row = (address: string, prefs: PushPrefs, endpoint = `https://push/${address}`): Row => ({
  endpoint,
  address,
  p256dh: "p",
  auth: "a",
  prefs: JSON.stringify(prefs),
});

beforeEach(() => {
  db = openDb(":memory:");
});

describe("preferences", () => {
  it("replies are on unless turned off", () => {
    expect(wantsReply({})).toBe(true);
    expect(wantsReply({ replies: false })).toBe(false);
  });

  it("a vote is measured against a whole vote by default", () => {
    expect(wantsVote({}, MEANINGFUL_WEIGHT)).toBe(true);
    expect(wantsVote({}, MEANINGFUL_WEIGHT - 1)).toBe(false);
    expect(wantsVote({ votes: "all" }, 1)).toBe(true);
    expect(wantsVote({ votes: "off" }, 999)).toBe(false);
  });

  it("a community defaults to hot", () => {
    expect(subLevel({}, "cats")).toBe("hot");
    expect(subLevel({ communities: { cats: "all" } }, "cats")).toBe("all");
  });
});

describe("recipients", () => {
  it("tells the parent's author about a reply", () => {
    post("1", A, "cats");
    post("2", B, "cats", "1");
    const rows = [row(A, {})];
    const got = recipients(rows, db, {
      kind: "post", id: "2", author: B, parentId: "1", community: "cats", text: "post 2",
    });
    expect(got).toHaveLength(1);
    expect(got[0].row.address).toBe(A);
    expect(got[0].payload.url).toBe("/p/2/");
    expect(got[0].payload.title).toContain("bbbb");
  });

  it("stays quiet when replies are off", () => {
    post("1", A, "cats");
    post("2", B, "cats", "1");
    expect(
      recipients([row(A, { replies: false })], db, {
        kind: "post", id: "2", author: B, parentId: "1", community: "cats", text: "post 2",
      }),
    ).toEqual([]);
  });

  it("tells the author about a meaningful like, and never about their own", () => {
    post("1", A, "cats");
    const event = {
      kind: "vote" as const, vote: "like" as const, id: "1", account: B,
      weight: MEANINGFUL_WEIGHT, author: A, community: "cats", crossedHot: false,
    };
    expect(recipients([row(A, {})], db, event).map((r) => r.row.address)).toEqual([A]);
    expect(recipients([row(A, {})], db, { ...event, weight: 25 })).toEqual([]);
    expect(recipients([row(A, {})], db, { ...event, account: A })).toEqual([]);
  });

  it("names one endpoint per device, so no device is told twice", () => {
    post("1", A, "cats");
    const rows = [row(A, {}, "https://push/a"), row(A, {}, "https://push/b")];
    const got = recipients(rows, db, {
      kind: "vote", vote: "like", id: "1", account: B,
      weight: MEANINGFUL_WEIGHT, author: A, community: "cats", crossedHot: false,
    });
    expect(got).toHaveLength(2);
    expect(new Set(got.map((g) => g.row.endpoint)).size).toBe(2);
  });

  it("tells every watcher about a new community post, but not the author", () => {
    post("1", C, "cats");
    const event = {
      kind: "post" as const, id: "1", author: C, parentId: "0", community: "cats", text: "m/cats hi",
    };
    const rows = [row(A, { communities: { cats: "all" } }), row(B, { communities: { cats: "hot" } }), row(C, { communities: { cats: "all" } })];
    const got = recipients(rows, db, event);
    expect(got.map((r) => r.row.address)).toEqual([A]);
    expect(got[0].payload.title).toContain("m/cats");
  });

  it("announces a hot post on the vote that crossed it", () => {
    post("1", C, "cats", "0", "m/cats a good one");
    const event = {
      kind: "vote" as const, vote: "like" as const, id: "1", account: B,
      weight: MEANINGFUL_WEIGHT, author: C, community: "cats", crossedHot: true,
    };
    const rows = [row(A, { communities: { cats: "hot" } }), row("0xdddd", { communities: { cats: "all" } })];
    const got = recipients(rows, db, event);
    expect(got.map((r) => r.row.address)).toEqual([A]);
    expect(got[0].payload.title).toContain("hot");
  });
});

describe("subscriptions", () => {
  it("stores one row per endpoint and updates the address on re-subscribe", () => {
    saveSubscription(db, A, { endpoint: "https://push/x", keys: { p256dh: "1", auth: "2" } }, { replies: true });
    saveSubscription(db, B, { endpoint: "https://push/x", keys: { p256dh: "3", auth: "4" } }, { replies: false });

    const all = db.prepare("SELECT address, p256dh, prefs FROM push_subscriptions").all() as {
      address: string; p256dh: string; prefs: string;
    }[];
    expect(all).toHaveLength(1);
    expect(all[0].address).toBe(B);
    expect(all[0].p256dh).toBe("3");
    expect(JSON.parse(all[0].prefs)).toEqual({ replies: false });
  });

  it("updates preferences for an address and removes by endpoint", () => {
    saveSubscription(db, A, { endpoint: "https://push/x", keys: { p256dh: "1", auth: "2" } }, {});
    syncPrefs(db, A, { votes: "all" });
    expect(rowsFor(db)).toBe(1);
    expect(db.prepare("SELECT prefs FROM push_subscriptions").get()).toEqual({
      prefs: JSON.stringify({ votes: "all" }),
    });

    removeSubscription(db, "https://push/x");
    expect(rowsFor(db)).toBe(0);
  });
});

const rowsFor = (d: Db) =>
  (d.prepare("SELECT COUNT(*) AS n FROM push_subscriptions").get() as { n: number }).n;
