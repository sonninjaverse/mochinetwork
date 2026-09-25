import { hexToString, parseAbiItem, type Address } from "viem";
import type { Db } from "./db";

export const EVENTS = [
  parseAbiItem("event Created(bytes32 indexed name, address indexed creator, uint64 at, string metadataURI)"),
  parseAbiItem("event MetadataUpdated(bytes32 indexed name, string metadataURI)"),
  parseAbiItem("event Joined(bytes32 indexed name, address indexed account, uint64 at)"),
  parseAbiItem("event Left(bytes32 indexed name, address indexed account)"),
  parseAbiItem(
    "event PostCreated(uint256 indexed id, address indexed author, uint48 createdAt, uint48 parentId, bytes32 community, string text, string mediaURI)",
  ),
  parseAbiItem("event Liked(uint256 indexed id, address indexed account, uint32 weight)"),
  parseAbiItem("event Unliked(uint256 indexed id, address indexed account)"),
  parseAbiItem("event Disliked(uint256 indexed id, address indexed account, uint32 weight)"),
  parseAbiItem("event Undisliked(uint256 indexed id, address indexed account)"),
  parseAbiItem(
    "event Registered(address indexed account, bytes32 indexed handle, string metadataURI)",
  ),
  parseAbiItem(
    "event HandleChanged(address indexed account, bytes32 indexed from, bytes32 indexed to)",
  ),
] as const;

export type DecodedLog = {
  eventName: string;
  args: Record<string, unknown>;
  blockNumber: bigint;
  logIndex: number;
};

/// Addresses are lower-cased on the way in so lookups never depend on the
/// checksum casing an RPC happens to return.
const addr = (v: unknown) => String(v).toLowerCase() as Address;

/// bytes32 handles are ASCII padded with zero bytes.
const handle = (v: unknown) => hexToString(v as `0x${string}`).replace(/\0+$/, "");

/** A post that has earned a whole vote's worth of weighted likes. */
export const HOT_LIKES = 100;

/**
 * What a freshly applied log means for a notification, or null when it means
 * nothing was added. Only the events a reader can be told about are returned,
 * and only when they actually changed the cache — a replayed log that was
 * already indexed stays silent.
 */
export type AppliedEvent =
  | {
      kind: "post";
      id: string;
      author: string;
      /** "0" for a top-level post; otherwise the post it answers. */
      parentId: string;
      community: string;
      text: string;
    }
  | {
      kind: "vote";
      vote: "like" | "dislike";
      id: string;
      account: string;
      weight: number;
      author: string;
      community: string;
      /** This like just carried the post past a whole vote. */
      crossedHot: boolean;
    }
  | null;

export function applyLog(db: Db, log: DecodedLog): AppliedEvent {
  const block = Number(log.blockNumber);
  const idx = log.logIndex;
  const a = log.args;

  switch (log.eventName) {
    case "PostCreated": {
      const parentId = String(a.parentId ?? 0);
      // A reply inherits its parent's community; a top-level post brings its
      // own, which the contract already checked the author joined.
      const community = parentId !== "0"
        ? (db.prepare("SELECT community FROM posts WHERE id = ?").get(parentId) as { community: string } | undefined)?.community ?? ""
        : (a.community ? handle(a.community) : "");
      const info = db.prepare(
        `INSERT OR IGNORE INTO posts
           (id, author, text, media_uri, parent_id, created_at, block, log_index, community)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      ).run(
        String(a.id),
        addr(a.author),
        String(a.text),
        String(a.mediaURI ?? ""),
        String(a.parentId ?? 0),
        Number(a.createdAt),
        block,
        idx,
        community,
      );
      if (info.changes === 0) return null;
      return {
        kind: "post",
        id: String(a.id),
        author: addr(a.author),
        parentId,
        community,
        text: String(a.text),
      };
    }

    case "Created":
      db.prepare(`INSERT OR IGNORE INTO communities
        (name, creator, metadata_uri, created_at, created_block, created_log_index)
        VALUES (?,?,?,?,?,?)`).run(handle(a.name), addr(a.creator), String(a.metadataURI ?? ""), Number(a.at), block, idx);
      break;
    case "MetadataUpdated":
      db.prepare("UPDATE communities SET metadata_uri = ? WHERE name = ?")
        .run(String(a.metadataURI ?? ""), handle(a.name));
      break;
    case "Joined":
    case "Left":
      db.prepare(`INSERT INTO memberships (name, account, active, block, log_index)
        VALUES (?,?,?,?,?) ON CONFLICT(name, account) DO UPDATE SET
        active = excluded.active, block = excluded.block, log_index = excluded.log_index`)
        .run(handle(a.name), addr(a.account), log.eventName === "Joined" ? 1 : 0, block, idx);
      break;

    case "Liked":
    case "Unliked": {
      const id = String(a.id);
      const account = addr(a.account);
      const before = db.prepare("SELECT active FROM likes WHERE post_id = ? AND account = ?").get(id, account) as
        | { active: number }
        | undefined;

      // A vote is one direction at a time on chain, so a like clears any
      // dislike by the same account. Mirroring that here keeps the cache from
      // counting one voter in both columns.
      if (log.eventName === "Liked") {
        db.prepare("UPDATE dislikes SET active = 0 WHERE post_id = ? AND account = ?").run(id, account);
      }
      // Unliked carries no weight, so a withdrawal must not overwrite the
      // weight the original Liked stamped on this row — active = 0 is what
      // takes the vote out of every sum, not a zeroed weight.
      db.prepare(
        `INSERT INTO likes (post_id, account, active, block, log_index, weight)
         VALUES (?,?,?,?,?,?)
         ON CONFLICT(post_id, account) DO UPDATE SET
           active = excluded.active, block = excluded.block,
           log_index = excluded.log_index,
           weight = CASE WHEN excluded.active = 1 THEN excluded.weight ELSE likes.weight END`,
      ).run(id, account, log.eventName === "Liked" ? 1 : 0, block, idx, Number(a.weight ?? 0));

      // Only a fresh, active like is news. A withdrawal is not, and a repeat
      // of one already active is the tail replaying a block after a reconnect.
      if (log.eventName !== "Liked" || (before && before.active === 1)) return null;

      const target = db.prepare("SELECT author, community, parent_id FROM posts WHERE id = ?").get(id) as
        | { author: string; community: string; parent_id: string }
        | undefined;
      if (!target) return null;

      const weight = Number(a.weight ?? 0);
      const total = (
        db.prepare("SELECT COALESCE(SUM(weight),0) AS s FROM likes WHERE post_id = ? AND active = 1").get(id) as {
          s: number;
        }
      ).s;
      return {
        kind: "vote",
        vote: "like",
        id,
        account,
        weight,
        author: target.author,
        community: target.community,
        // A community post becomes worth hearing about when its first whole
        // vote lands, and only on the vote that crossed it.
        crossedHot: target.parent_id === "0" && total >= HOT_LIKES && total - weight < HOT_LIKES,
      };
    }

    case "Disliked":
    case "Undisliked": {
      const id = String(a.id);
      const account = addr(a.account);
      const before = db.prepare("SELECT active FROM dislikes WHERE post_id = ? AND account = ?").get(id, account) as
        | { active: number }
        | undefined;

      // Same rule as likes: Undisliked has no weight of its own, so a
      // withdrawal keeps the old one and relies on active = 0 to exclude it.
      db.prepare(
        `INSERT INTO dislikes (post_id, account, active, block, log_index, weight)
         VALUES (?,?,?,?,?,?)
         ON CONFLICT(post_id, account) DO UPDATE SET
           active = excluded.active, block = excluded.block,
           log_index = excluded.log_index,
           weight = CASE WHEN excluded.active = 1 THEN excluded.weight ELSE dislikes.weight END`,
      ).run(id, account, log.eventName === "Disliked" ? 1 : 0, block, idx, Number(a.weight ?? 0));
      if (log.eventName === "Disliked") {
        db.prepare("UPDATE likes SET active = 0 WHERE post_id = ? AND account = ?").run(id, account);
      }

      if (log.eventName !== "Disliked" || (before && before.active === 1)) return null;
      const target = db.prepare("SELECT author, community FROM posts WHERE id = ?").get(id) as
        | { author: string; community: string }
        | undefined;
      if (!target) return null;

      return {
        kind: "vote",
        vote: "dislike",
        id,
        account,
        weight: Number(a.weight ?? 0),
        author: target.author,
        community: target.community,
        crossedHot: false,
      };
    }

    case "Registered":
      db.prepare(
        `INSERT INTO handles (address, handle, metadata_uri) VALUES (?,?,?)
         ON CONFLICT(address) DO UPDATE SET
           handle = excluded.handle, metadata_uri = excluded.metadata_uri`,
      ).run(addr(a.account), handle(a.handle), String(a.metadataURI ?? ""));
      break;

    // A rename is the same row with a different name. The old handle is freed
    // on chain in the same call, so nothing here needs to release it.
    case "HandleChanged":
      db.prepare("UPDATE handles SET handle = ? WHERE address = ?").run(
        handle(a.to),
        addr(a.account),
      );
      break;

    default:
      // A contract upgrade could emit something this build does not know.
      // Skipping is correct; throwing would stall the whole pipeline.
      break;
  }
  return null;
}
