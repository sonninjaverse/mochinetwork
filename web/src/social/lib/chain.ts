import { createPublicClient, http, webSocket } from "viem";
import { appChain } from "@/lib/chain/config";

export const monadTestnet = appChain;
const RPC_HTTP = appChain.rpcUrls.default.http[0];
const RPC_WS = appChain.rpcUrls.default.webSocket?.[0];

/**
 * Reads go through Multicall3.
 *
 * The public RPC answers "requests limited to 15/sec", and the feed control
 * alone asks for a name and a description per registered algorithm. Sent one
 * at a time that trips the limit, and a rejected read left the algorithm list
 * empty — the page saying there is nothing to choose from, which is the one
 * thing it must never say. Batched, a whole panel costs a single eth_call.
 *
 * `wait` is a frame rather than 0 so reads issued by different components in
 * the same render still land in one batch.
 */
export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(RPC_HTTP),
  batch: { multicall: { wait: 16 } },
});

/// Separate client: log subscriptions must not share a transport with reads,
/// or a dropped socket takes the whole feed down with it.
export const wsClient = RPC_WS
  ? createPublicClient({ chain: monadTestnet, transport: webSocket(RPC_WS) })
  : null;
