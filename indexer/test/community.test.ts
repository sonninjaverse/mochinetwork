import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stringToHex } from "viem";
import { parseTag } from "../src/community";
import { openDb, migrate, type Db } from "../src/db";
import { applyLog, type DecodedLog } from "../src/decode";
import { backfill, getCursor, setCursor } from "../src/ingest";
import { bootstrapCommunities } from "../src/community-backfill";
import { candidates, communityOf, postsByIds } from "../src/queries";
import { createServer } from "../src/server";

describe("community tokens", () => {
  it.each([
    ["m/monad hello", "monad"], ["hi\nm/VietNam\tthere", "vietnam"],
    ["m/first m/second", "first"], ["m/a_1", "a_1"],
    ["https://social.example/m/monad", null], ["m/ab", null],
    ["m/abcdefghijklmnopqrstuv", null], ["m/monad, hello", null],
    ["(m/monad)", null], ["m/monad/abc", null], ["m/monadé", null],
  ])("parses %s", (text, expected) => expect(parseTag(text!)).toBe(expected));
});

let db: Db;
beforeEach(() => { db = openDb(":memory:"); });
afterEach(() => db.close());

const event = (eventName: string, args: Record<string, unknown>, block = 10, index = 0): DecodedLog =>
  ({ eventName, args, blockNumber: BigInt(block), logIndex: index });
const name = stringToHex("monad", { size: 32 });
const ZERO = `0x${"0".repeat(64)}`;
const communityName = (n: string) => (n ? stringToHex(n, { size: 32 }) : ZERO);

const created = event("Created", { name, creator: "0xA1", at: 1700, metadataURI: "" });

/// A post carries its community as a field now, so the text is only text.
const posted = (id: number, community = "monad", text = "hello", block = 11, index = 0, parentId = 0) =>
  event("PostCreated", { id, author: "0xA1", text, createdAt: 1700 + id, parentId, community: communityName(community) }, block, index);

const community = (id: string) => postsByIds(db, [id])[0].community;

it("takes the community from the event, and nothing from the text", () => {
  applyLog(db, posted(1, "monad", "m/ghost hello"));
  applyLog(db, posted(2, ""));

  // The tag in the text is ignored; the field decides.
  expect(community("1")).toBe("monad");
  expect(community("2")).toBe("");
});

it("inherits the root community through nested replies", () => {
  applyLog(db, posted(1, "monad"));
  applyLog(db, posted(2, "", "m/other reply", 12, 0, 1));
  applyLog(db, posted(3, "", "reply again", 13, 0, 2));

  expect([1, 2, 3].map((id) => community(String(id)))).toEqual(["monad", "monad", "monad"]);
});

it("filters community and joined candidates, excluding replies and departed memberships", async () => {
  applyLog(db, created);
  applyLog(db, posted(1, "monad"));
  applyLog(db, posted(2, "", "reply", 12, 0, 1));
  applyLog(db, posted(3, ""));

  applyLog(db, event("Joined", { name, account: "0xB2" }, 12));
  expect(candidates(db, "community", 50, undefined, "MONAD")).toEqual(["1"]);
  expect(candidates(db, "community", 50)).toEqual([]);
  expect(candidates(db, "joined", 50, "0xB2")).toEqual(["1"]);
  expect(candidates(db, "joined", 50)).toEqual([]);
  expect(communityOf(db, "monad", "0xb2")).toMatchObject({ memberCount: 1, postCount: 1, joined: true });

  const app = createServer(db);
  expect((await (await app.request("/candidates?strategy=community&community=monad")).json()).ids).toEqual(["1"]);
  expect((await (await app.request("/communities/monad?viewer=0xB2")).json()).community.joined).toBe(true);
  expect((await app.request("/communities/ghost")).status).toBe(404);
  expect((await (await app.request("/communities?q=mo")).json()).communities).toHaveLength(1);

  applyLog(db, event("Left", { name, account: "0xB2" }, 13));
  expect(candidates(db, "joined", 50, "0xb2")).toEqual([]);
  expect(communityOf(db, "monad")?.memberCount).toBe(0);
});

it("updates descriptions and keeps them when Created is replayed", () => {
  applyLog(db, created);
  applyLog(db, event("MetadataUpdated", { name, metadataURI: "ipfs://description" }, 12));
  applyLog(db, created);
  expect(communityOf(db, "monad")?.metadataURI).toBe("ipfs://description");
});

it("migrates old rows in place without resetting the cursor", () => {
  db.exec(`DROP TABLE posts; CREATE TABLE posts (
    id TEXT PRIMARY KEY, author TEXT NOT NULL, text TEXT NOT NULL, media_uri TEXT NOT NULL DEFAULT '',
    parent_id TEXT NOT NULL DEFAULT '0', created_at INTEGER NOT NULL, block INTEGER NOT NULL, log_index INTEGER NOT NULL);
    INSERT INTO posts VALUES ('1','0xa1','m/monad old','','0',1700,1,0)`);
  setCursor(db, 1234);
  migrate(db);
  migrate(db);
  // A row from before the field existed has no community to invent.
  expect(community("1")).toBe("");
  expect(getCursor(db)).toBe(1234);
});

it("sorts mixed contract logs and survives replay", async () => {
  const logs = [posted(1, "monad"), created, posted(2, "", "reply", 12, 0, 1)];
  const client = { getLogs: vi.fn(async () => logs) } as never;
  await backfill(db, client, 10n, 12n);
  expect(community("1")).toBe("monad");
  expect(community("2")).toBe("monad");
  await backfill(db, client, 10n, 12n);
  expect(communityOf(db, "monad")?.postCount).toBe(1);
});

it("adds registry history to an existing index without resetting its cursor", async () => {
  applyLog(db, posted(1, ""));
  applyLog(db, posted(2, "monad"));
  applyLog(db, posted(3, "", "reply", 12, 0, 2));
  setCursor(db, 999);

  const getLogs = vi.fn(async () => [created]);
  const address = "0x00000000000000000000000000000000000000cc";
  await bootstrapCommunities(db, { getLogs } as never, address, 10n, 12n);

  expect(getLogs).toHaveBeenCalledWith(expect.objectContaining({ address: [address], fromBlock: 10n }));
  expect(getCursor(db)).toBe(999);
  // The registry backfill does not touch a post's community; the field set it.
  expect([1, 2, 3].map((id) => community(String(id)))).toEqual(["", "monad", "monad"]);

  await bootstrapCommunities(db, { getLogs } as never, address, 10n, 12n);
  expect(getLogs).toHaveBeenCalledTimes(1);
});
