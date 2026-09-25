import type { Address, PublicClient } from "viem";
import type { Db } from "./db";
import { applyLog, EVENTS, type AppliedEvent, type DecodedLog } from "./decode";
import { dispatch } from "./push";

/// Restart rewinds this many blocks before resuming. Ingest is idempotent, so
/// re-processing is free, and it covers a short reorg without special code.
const REORG_BUFFER = 20;

/// Monad's public RPC rejects eth_getLogs over a 100-block range outright:
/// `eth_getLogs is limited to a 100 range`, code -32614. A dedicated provider
/// allows far more, so this is configurable rather than fixed.
export const DEFAULT_CHUNK_SIZE = Number(process.env.LOG_CHUNK_SIZE ?? 100);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/// Public endpoints rate-limit a backfill that issues hundreds of requests.
/// Retrying with backoff turns that from a crash into a pause.
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let delay = 500;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= 5) throw error;
      console.warn(`  ${label} failed (attempt ${attempt}), retrying in ${delay}ms`);
      await sleep(delay);
      delay *= 2;
    }
  }
}

export function getCursor(db: Db): number {
  return (db.prepare("SELECT last_block FROM cursor WHERE id = 1").get() as any).last_block;
}

export function setCursor(db: Db, block: number): void {
  db.prepare("UPDATE cursor SET last_block = ? WHERE id = 1").run(block);
}

export async function backfill(
  db: Db,
  client: PublicClient,
  fromBlock: bigint,
  toBlock: bigint,
  chunkSize = DEFAULT_CHUNK_SIZE,
  addresses?: Address[],
  advanceCursor = true,
): Promise<void> {
  const total = Number(toBlock - fromBlock) + 1;
  let done = 0;
  let found = 0;

  for (let start = fromBlock; start <= toBlock; start += BigInt(chunkSize)) {
    const end = start + BigInt(chunkSize) - 1n > toBlock ? toBlock : start + BigInt(chunkSize) - 1n;

    const logs = (await withRetry(
      () =>
        client.getLogs({
          address: addresses,
          events: EVENTS as never,
          fromBlock: start,
          toBlock: end,
        } as never),
      `getLogs ${start}-${end}`,
    )) as unknown as DecodedLog[];

    found += logs.length;
    done += Number(end - start) + 1;
    if (done % (chunkSize * 50) === 0 || end === toBlock) {
      console.log(`  ${Math.round((done / total) * 100)}%  ${found} events`);
    }

    // One transaction per chunk: either the whole chunk and its cursor land,
    // or neither does, so a crash mid-chunk cannot leave the cursor ahead of
    // the data it claims to cover.
    db.transaction(() => {
      for (const log of orderedLogs(logs)) applyLog(db, log);
      if (advanceCursor) setCursor(db, Number(end));
    })();
  }
}

function orderedLogs(logs: DecodedLog[]): DecodedLog[] {
  return [...logs].sort((a, b) => a.blockNumber === b.blockNumber
    ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1);
}

/**
 * Whether the tail's connection is working, which the cursor cannot say.
 *
 * The cursor only moves when a block carries an event, so on a quiet chain it
 * stands still while the indexer is healthy. The heartbeat asks the tail's own
 * transport for the chain head on a timer: a recent answer proves the
 * connection the tail depends on is alive, whether or not anyone has posted.
 */
export type TailStatus = { head: number; at: number };

export const HEARTBEAT_MS = 5_000;

export function startTail(
  db: Db,
  client: PublicClient,
  addresses?: Address[],
  status?: TailStatus,
): () => void {
  const beat = setInterval(async () => {
    try {
      const head = Number(await client.getBlockNumber());
      if (status) {
        status.head = head;
        status.at = Date.now();
      }
    } catch {
      // Leave the last heartbeat where it is. A stale timestamp is the signal;
      // overwriting it with a failed poll would report a dead tail as alive.
    }
  }, HEARTBEAT_MS);
  if (typeof beat.unref === "function") beat.unref();

  const unwatch = client.watchEvent({
    address: addresses,
    events: EVENTS as never,
    onLogs: (logs: unknown) => {
      const decoded = logs as DecodedLog[];
      const applied: Exclude<AppliedEvent, null>[] = [];
      db.transaction(() => {
        for (const log of orderedLogs(decoded)) {
          const event = applyLog(db, log);
          if (event) applied.push(event);
        }
        const highest = decoded.reduce((m, l) => Math.max(m, Number(l.blockNumber)), 0);
        if (highest > getCursor(db)) setCursor(db, highest);
      })();
      // After the transaction: a push leaves the process, and it does not get
      // to hold the database open while it waits on a push service.
      for (const event of applied) void dispatch(db, event);
    },
    pollingInterval: 500,
  } as never);

  return () => {
    clearInterval(beat);
    unwatch();
  };
}

export function resumePoint(db: Db, deployBlock: bigint): bigint {
  const cursor = getCursor(db);
  if (cursor === 0) return deployBlock;
  const rewound = cursor - REORG_BUFFER;
  return BigInt(rewound > 0 ? rewound : 0);
}
