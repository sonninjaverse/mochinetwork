import { publicClient, wsClient } from "./chain";
import { CONTRACTS, postRegistryAbi } from "./contracts";

const postCreated = postRegistryAbi.find((e) => e.type === "event" && e.name === "PostCreated")!;

/**
 * New posts arrive straight from a node, not from a server push. The post shows
 * up because the chain said so, which is the part of "realtime" that is real.
 *
 * Falls back to polling when no WebSocket endpoint is configured: still
 * sub-second, just less elegant.
 */
export function watchNewPosts(onPost: (id: bigint) => void): () => void {
  const client = wsClient ?? publicClient;

  return client.watchEvent({
    address: CONTRACTS.postRegistry,
    event: postCreated as never,
    onLogs: (logs: unknown[]) => {
      for (const log of logs) {
        const id = (log as { args?: { id?: bigint } }).args?.id;
        if (id !== undefined) onPost(id);
      }
    },
    // viem streams on a websocket transport and polls on an http one, so this
    // interval only applies to the fallback path.
    pollingInterval: 500,
  } as never);
}
