import type { Address } from "viem";
import { publicClient } from "./chain";
import { algorithmRegistryAbi, CONTRACTS, feedAlgorithmAbi } from "./contracts";

export type AlgorithmInfo = {
  id: number;
  address: Address;
  name: string;
  description: string;
};

/**
 * The registry only grows, and nothing in a session invalidates it, so the
 * list is fetched once. Without this every mount of the feed control paid for
 * the whole list again — on the public RPC, which rate-limits.
 */
let cached: Promise<AlgorithmInfo[]> | null = null;

export function listAlgorithms(): Promise<AlgorithmInfo[]> {
  cached ??= fetchAlgorithms().catch((error) => {
    // A failed fetch must not be remembered as the answer.
    cached = null;
    throw error;
  });
  return cached;
}

/**
 * Issues every read at once so the client's multicall batcher can send them as
 * one eth_call. Sequentially this was 1 + 3n requests against an endpoint that
 * allows 15 a second.
 */
async function fetchAlgorithms(): Promise<AlgorithmInfo[]> {
  const count = Number(
    await publicClient.readContract({
      address: CONTRACTS.algorithmRegistry,
      abi: algorithmRegistryAbi,
      functionName: "algorithmCount",
    }),
  );

  const addresses = await Promise.all(
    Array.from(
      { length: count },
      (_, id) =>
        publicClient.readContract({
          address: CONTRACTS.algorithmRegistry,
          abi: algorithmRegistryAbi,
          functionName: "algorithmAt",
          args: [BigInt(id)],
        }) as Promise<Address>,
    ),
  );

  const described = await Promise.all(
    addresses.map(async (address, id): Promise<AlgorithmInfo> => {
      try {
        const [name, description] = await Promise.all([
          publicClient.readContract({ address, abi: feedAlgorithmAbi, functionName: "name" }),
          publicClient.readContract({ address, abi: feedAlgorithmAbi, functionName: "description" }),
        ]);
        return { id, address, name: name as string, description: description as string };
      } catch {
        // A registered contract that stopped answering must not blank the list.
        return { id, address, name: `Algorithm #${id}`, description: "" };
      }
    }),
  );

  // The registry lists the two defaults first and then everything else in
  // registration order, so ids 0 and 1 can repeat an entry registered later.
  const seen = new Set<string>();
  return described.filter((a) => (seen.has(a.address) ? false : (seen.add(a.address), true)));
}
