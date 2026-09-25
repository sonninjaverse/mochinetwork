/** Sanity checks on the seeded network. Run after each seeding step. */
import { createPublicClient, defineChain, http } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { RING_SIZE, SYBIL_OFFSET } from "./sybil";

const chain = defineChain({
  id: Number(process.env.MONAD_CHAIN_ID),
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [process.env.MONAD_RPC_HTTP!] } },
});
const client = createPublicClient({ chain, transport: http(process.env.MONAD_RPC_HTTP!) });

const graphAbi = [
  { type: "function", name: "followerCount", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint32" }] },
  { type: "function", name: "depthOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint8" }] },
  { type: "function", name: "weightOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint32" }] },
] as const;

const GRAPH = process.env.SOCIAL_GRAPH as `0x${string}`;
const addr = (i: number) =>
  mnemonicToAccount(process.env.SEED_MNEMONIC!, { addressIndex: i }).address;

async function read(fn: "followerCount" | "depthOf" | "weightOf", i: number) {
  return Number(
    await client.readContract({ address: GRAPH, abi: graphAbi, functionName: fn, args: [addr(i)] }),
  );
}

async function main() {
  const followers: number[] = [];
  const depths: number[] = [];
  for (let i = 0; i < 120; i++) {
    followers.push(await read("followerCount", i));
    depths.push(await read("depthOf", i));
  }

  const sorted = [...followers].sort((a, b) => b - a);
  console.log("follower distribution");
  console.log("  top 5      ", sorted.slice(0, 5).join(", "));
  console.log("  bottom 5   ", sorted.slice(-5).join(", "));
  console.log("  mean       ", (followers.reduce((a, b) => a + b, 0) / 120).toFixed(1));
  console.log("  total edges", followers.reduce((a, b) => a + b, 0));

  const dist: Record<number, number> = {};
  for (const d of depths) dist[d] = (dist[d] ?? 0) + 1;
  console.log();
  console.log("depth distribution (255 = UNREACHED)");
  for (const [d, n] of Object.entries(dist).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    console.log(`  depth ${d.padStart(3)}  ${n} accounts`);
  }

  if (process.argv.includes("--ring")) {
    let unreached = 0;
    let zeroWeight = 0;
    for (let i = 0; i < RING_SIZE; i++) {
      if ((await read("depthOf", SYBIL_OFFSET + i)) === 255) unreached++;
      if ((await read("weightOf", SYBIL_OFFSET + i)) === 0) zeroWeight++;
    }
    console.log();
    console.log("sybil ring");
    console.log(`  UNREACHED   ${unreached}/${RING_SIZE}`);
    console.log(`  zero weight ${zeroWeight}/${RING_SIZE}`);
  }
}

void main();
