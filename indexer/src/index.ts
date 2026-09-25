import { serve } from "@hono/node-server";
import { createPublicClient, defineChain, http, webSocket, type Address } from "viem";
import { openDb } from "./db";
import { backfill, DEFAULT_CHUNK_SIZE, resumePoint, startTail, type TailStatus } from "./ingest";
import { configurePush } from "./push";
import { createServer } from "./server";
import { bootstrapCommunities } from "./community-backfill";

const chain = defineChain({
  id: Number(process.env.MONAD_CHAIN_ID),
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [process.env.MONAD_RPC_HTTP!] } },
  testnet: true,
});

const addresses = [
  process.env.POST_REGISTRY,
  process.env.IDENTITY_REGISTRY,
  process.env.COMMUNITY_REGISTRY,
].filter(Boolean) as Address[];

async function main() {
  configurePush();
  const db = openDb(process.env.DB_PATH ?? "./mochi.db");
  const httpClient = createPublicClient({ chain, transport: http(process.env.MONAD_RPC_HTTP!) });
  const tailClient = process.env.MONAD_RPC_WS
    ? createPublicClient({ chain, transport: webSocket(process.env.MONAD_RPC_WS) })
    : httpClient;

  const deployBlock = BigInt(process.env.DEPLOY_BLOCK ?? "0");
  const head = await httpClient.getBlockNumber();
  const from = resumePoint(db, deployBlock);

  if (process.env.COMMUNITY_REGISTRY) {
    if (!/^\d+$/.test(process.env.COMMUNITY_DEPLOY_BLOCK ?? "")) {
      throw new Error("COMMUNITY_DEPLOY_BLOCK is required when COMMUNITY_REGISTRY is set");
    }
    await bootstrapCommunities(db, httpClient, process.env.COMMUNITY_REGISTRY as Address,
      BigInt(process.env.COMMUNITY_DEPLOY_BLOCK!), head);
  }

  console.log(`Backfilling ${from} -> ${head} (${head - from} blocks)`);
  // Chunk size comes from DEFAULT_CHUNK_SIZE, which respects LOG_CHUNK_SIZE.
  // Monad's public RPC caps eth_getLogs at a 100-block range.
  await backfill(db, httpClient, from, head, DEFAULT_CHUNK_SIZE, addresses);
  console.log("Backfill complete");

  const tail: TailStatus = { head: Number(head), at: Date.now() };
  startTail(db, tailClient, addresses, tail);
  console.log("Tailing head");

  const port = Number(process.env.PORT ?? 8787);
  serve({
    fetch: createServer(db, httpClient, tail).fetch,
    port,
  });
  console.log(`Serving on :${port}`);
}

void main();
