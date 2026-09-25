/** The demo beat, asserted rather than eyeballed. */
import { createPublicClient, defineChain, http } from "viem";

const chain = defineChain({
  id: Number(process.env.MONAD_CHAIN_ID),
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [process.env.MONAD_RPC_HTTP!] } },
});
const client = createPublicClient({ chain, transport: http(process.env.MONAD_RPC_HTTP!) });
const BASE = process.env.INDEXER_URL ?? "http://localhost:8787";

/**
 * Named here rather than read from the environment. The indexer only needs the
 * three contracts it watches, so DISCOVERY_FEED was unset and the rank call
 * went to `undefined` — which viem reports as "the contract returned no data",
 * sending you looking for a broken contract instead of a missing variable.
 */
function required(name: string): `0x${string}` {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} (see contracts/abi/addresses.env)`);
  return value as `0x${string}`;
}

const postAbi = [
  {
    type: "function",
    name: "postOf",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "author", type: "address" },
          { name: "createdAt", type: "uint48" },
          { name: "parentId", type: "uint48" },
          { name: "likeCount", type: "uint32" },
          { name: "weightedLikes", type: "uint32" },
          // These two were missing, so everything after weightedLikes decoded
          // one slot early. It never showed because the numbers this script
          // prints all come before them.
          { name: "dislikeCount", type: "uint32" },
          { name: "weightedDislikes", type: "uint32" },
          { name: "repostCount", type: "uint32" },
          { name: "replyCount", type: "uint32" },
        ],
      },
    ],
  },
] as const;

const rankAbi = [
  {
    type: "function",
    name: "rank",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "uint256[]" }],
    outputs: [{ type: "uint256[]" }, { type: "uint256[]" }],
  },
] as const;

const POSTS = process.env.POST_REGISTRY as `0x${string}`;
// A viewer with no history at all — the position a judge is in when they
// create an account during evaluation.
const NEWCOMER = "0x00000000000000000000000000000000000000fa".toLowerCase() as `0x${string}`;

async function main() {
  const ids: string[] = (
    await (await fetch(`${BASE}/candidates?strategy=recent&limit=1000`)).json()
  ).ids;
  const posts = (await (await fetch(`${BASE}/posts?ids=${ids.join(",")}`)).json()).posts;

  const spam = posts.filter((p: { text: string }) => p.text.includes("link in bio") || p.text.includes("parabolic") || p.text.includes("aped in") || p.text.includes("biggest launch") || p.text.includes("sleeping on this"));

  console.log(`network: ${posts.length} posts indexed\n`);
  console.log("ring posts on chain");
  for (const p of spam) {
    const onChain = (await client.readContract({
      address: POSTS,
      abi: postAbi,
      functionName: "postOf",
      args: [BigInt(p.id)],
    })) as { likeCount: number; weightedLikes: number };
    console.log(
      `  id ${String(p.id).padStart(3)}  likeCount ${String(onChain.likeCount).padStart(3)}  weightedLikes ${onChain.weightedLikes}   "${p.text.slice(0, 38)}…"`,
    );
  }

  const explore = (
    await (await fetch(`${BASE}/candidates?strategy=trending&limit=500`)).json()
  ).ids;
  const [ordered, scores] = (await client.readContract({
    address: required("DISCOVERY_FEED"),
    abi: rankAbi,
    functionName: "rank",
    args: [NEWCOMER, explore.map(BigInt)],
  })) as [bigint[], bigint[]];

  const spamIds = new Set(spam.map((p: { id: string }) => p.id));
  const top20 = ordered.slice(0, 20).map(String);
  const ringInTop = top20.filter((id) => spamIds.has(id));

  console.log(`\nExplore (DiscoveryFeed, fresh viewer, ${ordered.length} candidates)`);
  console.log(`  ring posts in top 20: ${ringInTop.length}`);
  const byId = new Map(posts.map((p: { id: string; text: string }) => [p.id, p.text]));
  for (let i = 0; i < 5; i++) {
    console.log(`  ${i + 1}. score ${scores[i]}  "${String(byId.get(top20[i]) ?? "?").slice(0, 46)}…"`);
  }
}

void main();
