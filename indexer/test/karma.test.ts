import { afterEach, expect, it } from "vitest";
import { openDb } from "../src/db";
import { applyLog } from "../src/decode";
import { karmaOf, postsByIds } from "../src/queries";
import { createServer } from "../src/server";

const db = openDb(":memory:");
const author = "0x00000000000000000000000000000000000000a1";
const voter = "0x00000000000000000000000000000000000000b2";
let block = 1n;
function event(eventName: string, args: Record<string, unknown>) {
  applyLog(db, { eventName, args, blockNumber: block++, logIndex: 0 });
}
afterEach(() => db.exec("DELETE FROM posts; DELETE FROM likes; DELETE FROM dislikes;"));

it("sums weighted votes in the chain's units, negatives included", () => {
  event("PostCreated", { id: 1n, author, text: "post", createdAt: 1700 });
  event("Disliked", { id: 1n, account: voter, weight: 60 });
  expect(karmaOf(db, author)).toEqual({ post: -60, comment: 0 });
  event("Disliked", { id: 1n, account: "0xc3", weight: 60 });
  expect(karmaOf(db, author).post).toBe(-120);
  event("Disliked", { id: 1n, account: author, weight: 100 });
  expect(karmaOf(db, author.toUpperCase()).post).toBe(-120);
});

it("tracks direction changes and withdrawals without losing the vote weight", () => {
  event("PostCreated", { id: 1n, author, text: "post", createdAt: 1700 });
  event("Liked", { id: 1n, account: voter, weight: 100 });
  expect(karmaOf(db, author).post).toBe(100);
  event("Disliked", { id: 1n, account: voter, weight: 100 });
  expect(karmaOf(db, author).post).toBe(-100);
  event("Undisliked", { id: 1n, account: voter });
  expect(karmaOf(db, author).post).toBe(0);
  expect(db.prepare("SELECT weight, active FROM likes").get()).toEqual({ weight: 100, active: 0 });
  expect(db.prepare("SELECT weight, active FROM dislikes").get()).toEqual({ weight: 100, active: 0 });
});

it("exposes matching karma on profiles, posts and replies over HTTP", async () => {
  event("PostCreated", { id: 1n, author, text: "post", createdAt: 1700 });
  event("PostCreated", { id: 2n, author, text: "reply", parentId: 1, createdAt: 1701 });
  event("Liked", { id: 1n, account: voter, weight: 100 });
  event("Disliked", { id: 2n, account: voter, weight: 100 });
  const app = createServer(db);
  const res = await app.request(`/profile/${author}`);
  expect(res.status).toBe(200);
  expect((await res.json()).profile).toMatchObject({ postKarma: 100, commentKarma: -100 });
  expect(postsByIds(db, ["1", "2"]).map(p => p.authorKarma)).toEqual([0, 0]);
  expect((await (await app.request("/posts?ids=1,2")).json()).posts[0].authorKarma).toBe(0);
});
