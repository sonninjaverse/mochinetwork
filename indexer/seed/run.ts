import { readFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Address,
  stringToHex,
  type PublicClient,
} from "viem";
import {
  mnemonicToAccount,
  nonceManager,
  privateKeyToAccount,
  type HDAccount,
} from "viem/accounts";
import { deriveAccounts, fundAccounts, requireFunds } from "./accounts";
import {
  assignPosts,
  buildDislikeEdges,
  buildFollowEdges,
  buildLikeEdges,
  makeRandom,
  type Corpus,
} from "./generate";
import { ANCHOR_OFFSET, ANCHOR_POSTS, ANCHORS } from "./anchors";

const STEP = process.argv[2];
const ACCOUNT_COUNT = 120;
const RANDOM_SEED = 42;

/// Sends go out from many accounts at once. Each account manages its own nonce,
/// so the only real limit is what the RPC tolerates — and the public endpoint
/// tolerates less than it first appears. At 8 in flight roughly a quarter of
/// sends came back as HTTP failures or rejected parameters.
const CONCURRENCY = Number(process.env.SEND_CONCURRENCY ?? 3);
const ATTEMPTS = 4;

const chain = defineChain({
  id: Number(process.env.MONAD_CHAIN_ID),
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [process.env.MONAD_RPC_HTTP!] } },
  testnet: true,
});

const rpc = process.env.MONAD_RPC_HTTP!;
const publicClient = createPublicClient({ chain, transport: http(rpc) }) as PublicClient;

const postAbi = JSON.parse(readFileSync("seed/abi/PostRegistry.json", "utf8"));
const POST_REGISTRY = process.env.POST_REGISTRY as Address;

const corpus: Corpus = JSON.parse(readFileSync("seed/corpus.json", "utf8"));

/// The depth-0 wallet the contracts were deployed with. It is the only account
/// that can put depth into the network.
function teamAccount() {
  const key = process.env.TEAM_PRIVATE_KEY!;
  return privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`);
}

/// nonceManager lets one account queue several sends without waiting for a
/// receipt between them, which is the difference between minutes and an hour.
function accounts(): HDAccount[] {
  return Array.from({ length: ACCOUNT_COUNT }, (_, i) =>
    mnemonicToAccount(process.env.SEED_MNEMONIC!, { addressIndex: i, nonceManager }),
  );
}

const walletFor = (account: HDAccount) =>
  createWalletClient({ account, chain, transport: http(rpc) });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs `work` over `items` with a bounded number in flight, retrying each item
 * with backoff.
 *
 * A public RPC rejects a burst, and a dropped send is a post that silently
 * never exists. Retrying turns a rate limit into a pause rather than a hole in
 * the demo data.
 */
async function pool<T>(items: T[], limit: number, work: (item: T, i: number) => Promise<void>) {
  let next = 0;
  let done = 0;
  let failed = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      let delay = 400;
      for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        try {
          await work(items[i], i);
          break;
        } catch (error) {
          if (attempt === ATTEMPTS) {
            failed++;
            console.warn(`  item ${i} gave up: ${(error as Error).message.split("\n")[0]}`);
          } else {
            await sleep(delay);
            delay *= 2;
          }
        }
      }
      if (++done % 50 === 0) console.log(`  ${done}/${items.length}`);
    }
  });

  await Promise.all(runners);
  console.log(`  ${done}/${items.length} done, ${failed} gave up`);
}

/**
 * Posts already on chain, by text. Lets the posts step resume: a run that lost
 * sends to rate limiting can simply be run again.
 *
 * Refuses to answer unless the indexer has actually caught up. It reports what
 * it has indexed, not what exists, and a freshly reset indexer reports nothing
 * — which once read as "no posts yet" and duplicated the entire corpus. An
 * empty answer from a source that is still catching up is not evidence of an
 * empty chain.
 */
async function existingPostTexts(): Promise<Set<string>> {
  const base = process.env.INDEXER_URL ?? "http://localhost:8787";

  let health: { reachable?: boolean; live?: boolean; tailAgeMs?: number | null };
  try {
    health = await (await fetch(`${base}/health`)).json();
  } catch {
    throw new Error(
      "Indexer unreachable. It is the only record of what has already been posted, " +
        "and guessing produces a duplicate corpus. Start it and try again.",
    );
  }

  // Not the cursor: it only moves when a block carries an event, so a healthy
  // indexer on a quiet chain sits thousands of blocks "behind" and this guard
  // used to refuse to run at all. `live` is the tail's own heartbeat, and the
  // server only starts listening once the backfill has finished.
  if (!health.reachable || !health.live) {
    throw new Error(
      `Indexer is not watching the chain (reachable=${health.reachable}, live=${health.live}, ` +
        `last heartbeat ${health.tailAgeMs}ms ago). It cannot yet say what is already on ` +
        "chain, and assuming nothing is would post the whole corpus twice.",
    );
  }

  const ids = (await (await fetch(`${base}/candidates?strategy=recent&limit=1000`)).json()).ids;
  if (!ids?.length) return new Set();
  const posts = (await (await fetch(`${base}/posts?ids=${ids.join(",")}`)).json()).posts;
  return new Set(posts.map((p: { text: string }) => p.text));
}

async function main() {
  const accs = accounts();
  const rand = makeRandom(RANDOM_SEED);
  const assignments = assignPosts(corpus, ACCOUNT_COUNT);

  switch (STEP) {
    case "fund": {
      // The deployer funds everything. Falling back to SEED_MNEMONIC here
      // would derive seed wallet #0 — an empty account trying to fund itself.
      const funder = createWalletClient({
        account: teamAccount(),
        chain,
        transport: http(rpc),
      });
      await fundAccounts(
        funder,
        publicClient,
        accs.map((a) => a.address),
        process.env.FUND_AMOUNT ?? "0.4",
      );
      break;
    }


    case "posts": {
      await requireFunds(publicClient, accs.map((a) => a.address), "0.02");
      const already = await existingPostTexts();
      const jobs = assignments
        .flatMap((a) => a.posts.map((text) => ({ a: a.account, text })))
        .filter((j) => !already.has(j.text));
      console.log(
        `Posting ${jobs.length} posts from ${ACCOUNT_COUNT} accounts (${already.size} already on chain)`,
      );
      await pool(jobs, CONCURRENCY, async ({ a, text }) => {
        await walletFor(accs[a]).writeContract({
          address: POST_REGISTRY,
          abi: postAbi,
          functionName: "post",
          args: [text, ""],
        } as never);
      });
      break;
    }


    case "likes": {
      await requireFunds(publicClient, accs.map((a) => a.address), "0.08");
      const postAuthor = assignments.flatMap((a) => a.posts.map(() => a.account));
      const edges = buildFollowEdges(assignments, makeRandom(RANDOM_SEED));
      const likes = buildLikeEdges(postAuthor, edges, makeRandom(RANDOM_SEED + 1));
      console.log(`Writing ${likes.length} likes`);
      await pool(likes, CONCURRENCY, async ([actor, postId]) => {
        await walletFor(accs[actor]).writeContract({
          address: POST_REGISTRY,
          abi: postAbi,
          functionName: "like",
          args: [BigInt(postId)],
        } as never);
      });
      break;
    }

    case "anchors": {
      const anchors = ANCHORS.map((_, i) =>
        mnemonicToAccount(process.env.SEED_MNEMONIC!, {
          addressIndex: ANCHOR_OFFSET + i,
          nonceManager,
        }),
      );

      const funder = createWalletClient({ account: teamAccount(), chain, transport: http(rpc) });
      await fundAccounts(
        funder,
        publicClient,
        anchors.map((a) => a.address),
        "0.15",
      );

      const identityAbi = JSON.parse(readFileSync("seed/abi/IdentityRegistry.json", "utf8"));
      const IDENTITY = process.env.IDENTITY_REGISTRY as Address;

      console.log("Registering handles");
      await pool(ANCHORS.slice(), CONCURRENCY, async (handle, i) => {
        await walletFor(anchors[i]).writeContract({
          address: IDENTITY,
          abi: identityAbi,
          functionName: "register",
          args: [stringToHex(handle, { size: 32 }), ""],
        } as never);
      });

      console.log("Posting anchor updates");
      await pool(ANCHORS.slice(), CONCURRENCY, async (handle, i) => {
        await walletFor(anchors[i]).writeContract({
          address: POST_REGISTRY,
          abi: postAbi,
          functionName: "post",
          args: [ANCHOR_POSTS[handle], ""],
        } as never);
      });
      break;
    }

    case "dislikes": {
      await requireFunds(publicClient, accs.map((a) => a.address), "0.05");
      const postAuthor = assignments.flatMap((a) => a.posts.map(() => a.account));
      const edges = buildFollowEdges(assignments, makeRandom(RANDOM_SEED));
      // assignPosts already grouped accounts by topic; reuse that rather than
      // re-deriving it, so agreement and disagreement follow the same seams.
      const topics = assignments.map((a) => [a.topic]);
      const dislikes = buildDislikeEdges(
        postAuthor,
        topics,
        edges,
        makeRandom(RANDOM_SEED + 2),
      );
      console.log(`Writing ${dislikes.length} dislikes`);
      await pool(dislikes, CONCURRENCY, async ([actor, postId]) => {
        await walletFor(accs[actor]).writeContract({
          address: POST_REGISTRY,
          abi: postAbi,
          functionName: "dislike",
          args: [BigInt(postId)],
        } as never);
      });
      break;
    }



    default:
      throw new Error(
        `Unknown step: ${STEP}. Use fund | anchors | posts | likes | dislikes`,
      );
  }
}

void main();
