import type { Address, PublicClient } from "viem";
import type { Db } from "./db";
import { backfill, DEFAULT_CHUNK_SIZE } from "./ingest";

/**
 * Add the community registry as an event source to an existing cache without
 * resetting the post cursor.
 *
 * A post used to name its community only in its text, so a post that arrived
 * before this registry did had to be classified afterwards. A post carries its
 * community now, so there is nothing to reconstruct here — only the registry's
 * own events to read.
 */
export async function bootstrapCommunities(db: Db, client: PublicClient, address: Address, deployedAt: bigint, head: bigint) {
  const source = address.toLowerCase();
  if (db.prepare("SELECT 1 FROM indexed_sources WHERE address = ?").get(source)) return;
  await backfill(db, client, deployedAt, head, DEFAULT_CHUNK_SIZE, [address], false);
  db.prepare("INSERT INTO indexed_sources (address, through_block) VALUES (?,?)").run(source, Number(head));
}
