/**
 * Seeds communities and their content from the corpus: one subreddit per topic,
 * the topic's posts tagged into it, and votes so the authors have karma.
 *
 *   node --env-file=.env --import tsx seed/reddit.ts fund|subs|posts|votes
 *
 * The community registry arrived after the corpus was first posted, and post
 * text is immutable, so the untagged originals stay where they are and this
 * posts a tagged copy. Every step is safe to re-run: a sub that exists is
 * skipped, a post whose text is already indexed is skipped, and a vote is one
 * direction at a time on chain.
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  stringToHex,
  type Address,
  type PublicClient,
} from "viem";
import { mnemonicToAccount, nonceManager, privateKeyToAccount, type HDAccount } from "viem/accounts";
import { fundAccounts, requireFunds } from "./accounts";
import type { Corpus } from "./generate";

const STEP = process.argv[2];
const ACCOUNT_COUNT = 120;
const LIKES_PER_VOTER = 2;
const DISLIKES_PER_VOTER = 1;
const CONCURRENCY = Number(process.env.SEND_CONCURRENCY ?? 3);
const ATTEMPTS = 4;
const ZERO = "0x0000000000000000000000000000000000000000";

const chain = defineChain({
  id: Number(process.env.MONAD_CHAIN_ID),
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [process.env.MONAD_RPC_HTTP!] } },
  testnet: true,
});

const rpc = process.env.MONAD_RPC_HTTP!;
// No balance cache: the fund step tops a wallet up and the next step reads it
// back immediately, and viem's default 4s cache made that read the old number.
const publicClient = createPublicClient({ chain, transport: http(rpc), cacheTime: 0 }) as PublicClient;

const postAbi = JSON.parse(readFileSync("seed/abi/PostRegistry.json", "utf8"));
const communityAbi = JSON.parse(readFileSync("seed/abi/CommunityRegistry.json", "utf8"));
const POST_REGISTRY = process.env.POST_REGISTRY as Address;
const COMMUNITY_REGISTRY = process.env.COMMUNITY_REGISTRY as Address;

const corpus: Corpus = JSON.parse(readFileSync("seed/corpus.json", "utf8"));
const perTopic = Math.floor(ACCOUNT_COUNT / corpus.topics.length);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function accounts(): HDAccount[] {
  return Array.from({ length: ACCOUNT_COUNT }, (_, i) =>
    mnemonicToAccount(process.env.SEED_MNEMONIC!, { addressIndex: i, nonceManager }),
  );
}

function teamAccount() {
  const key = process.env.TEAM_PRIVATE_KEY!;
  return privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`);
}

const walletFor = (account: HDAccount) => createWalletClient({ account, chain, transport: http(rpc) });

/** Bounded parallelism with retry, the same shape the other seed steps use. */
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
      if (++done % 25 === 0) console.log(`  ${done}/${items.length}`);
    }
  });

  await Promise.all(runners);
  console.log(`  ${done}/${items.length} done, ${failed} gave up`);
}

/**
 * The indexer is behind the private gate, and the seed script reads it to know
 * what already exists. It signs the same cookie the gate expects rather than
 * asking anyone to turn the gate off while seeding.
 */
function gateHeaders(): Record<string, string> {
  const secret = process.env.GATE_SECRET;
  if (!secret) return {};
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const signature = createHmac("sha256", secret).update(String(expiry)).digest("hex");
  return { cookie: `mochi_gate=${expiry}.${signature}` };
}

async function api<T>(path: string): Promise<T> {
  const base = process.env.INDEXER_URL ?? "http://localhost:8787";
  const res = await fetch(`${base}${path}`, { headers: gateHeaders() });
  if (!res.ok) throw new Error(`${path} answered ${res.status}`);
  return (await res.json()) as T;
}

/// Text of every top-level post already indexed, so a rerun skips them.
async function indexedTexts(): Promise<Set<string>> {
  const { ids } = await api<{ ids: string[] }>("/candidates?strategy=recent&limit=1000");
  if (!ids?.length) return new Set();
  const { posts } = await api<{ posts: { text: string }[] }>(`/posts?ids=${ids.join(",")}`);
  return new Set(posts.map((p) => p.text));
}

function describe(name: string): string {
  return `data:application/json,${encodeURIComponent(JSON.stringify({ description: `Everything about ${name}.` }))}`;
}

async function main() {
  const accs = accounts();

  switch (STEP) {
    case "fund": {
      const funder = createWalletClient({ account: teamAccount(), chain, transport: http(rpc) });
      await fundAccounts(
        funder,
        publicClient,
        accs.map((a) => a.address),
        process.env.FUND_TARGET ?? "0.08",
      );
      break;
    }

    case "handles": {
      await requireFunds(publicClient, accs.map((a) => a.address), "0.02");
      const identityAbi = JSON.parse(readFileSync("seed/abi/IdentityRegistry.json", "utf8"));
      const IDENTITY = process.env.IDENTITY_REGISTRY as Address;
      const jobs = corpus.topics.flatMap((topic, t) =>
        Array.from({ length: perTopic }, (_, k) => ({
          voter: accs[t * perTopic + k],
          handle: `${topic.name}${k}`,
        })),
      );
      console.log(`Registering ${jobs.length} handles`);
      await pool(jobs, CONCURRENCY, async ({ voter, handle }) => {
        try {
          const hash = await walletFor(voter).writeContract({
            address: IDENTITY,
            abi: identityAbi,
            functionName: "register",
            args: [stringToHex(handle, { size: 32 }), ""],
          } as never);
          await publicClient.waitForTransactionReceipt({ hash });
        } catch {
          // Already registered from an earlier run; nothing to do.
        }
      });
      break;
    }

    case "subs": {
      for (const [t, topic] of corpus.topics.entries()) {
        const creator = accs[t * perTopic];
        const bytes = stringToHex(topic.name, { size: 32 });
        const owner = (await publicClient.readContract({
          address: COMMUNITY_REGISTRY,
          abi: communityAbi,
          functionName: "creatorOf",
          args: [bytes],
        })) as Address;
        if (owner !== ZERO) {
          console.log(`  m/${topic.name} already exists`);
          continue;
        }
        const hash = await walletFor(creator).writeContract({
          address: COMMUNITY_REGISTRY,
          abi: communityAbi,
          functionName: "create",
          args: [bytes, describe(topic.name)],
        } as never);
        await publicClient.waitForTransactionReceipt({ hash });
        console.log(`  created m/${topic.name} by ${creator.address}`);
      }
      break;
    }

    case "posts": {
      await requireFunds(publicClient, accs.map((a) => a.address), "0.03");
      const already = await indexedTexts();
      // The community is an argument now, and the contract refuses it unless
      // the author has joined — run `joins` first.
      const jobs = corpus.topics.flatMap((topic, t) =>
        topic.posts.map((text, i) => ({
          account: t * perTopic + Math.floor(i / (topic.posts.length / perTopic)),
          community: stringToHex(topic.name, { size: 32 }),
          text,
        })),
      );
      const todo = jobs.filter((j) => !already.has(j.text));
      console.log(`Posting ${todo.length} community posts (${already.size} already indexed)`);
      await pool(todo, CONCURRENCY, async ({ account, community, text }) => {
        await walletFor(accs[account]).writeContract({
          address: POST_REGISTRY,
          abi: postAbi,
          functionName: "postToCommunity",
          args: [community, text, ""],
        } as never);
      });
      break;
    }

    case "joins": {
      await requireFunds(publicClient, accs.map((a) => a.address), "0.025");
      const joins: { voter: HDAccount; name: string }[] = [];
      const joined = new Set<string>();
      const addJoin = (voter: HDAccount, name: string) => {
        const key = `${voter.address}-${name}`;
        if (joined.has(key)) return;
        joined.add(key);
        joins.push({ voter, name });
      };

      for (const [t, topic] of corpus.topics.entries()) {
        const voters = accs.slice(t * perTopic, (t + 1) * perTopic);
        for (const [v, voter] of voters.entries()) {
          // Their own sub, plus one other, so Home is not a single feed and
          // member counts are not all one.
          addJoin(voter, topic.name);
          addJoin(voter, corpus.topics[(t + v + 1) % corpus.topics.length].name);
        }
      }

      console.log(`Joining ${joins.length} memberships`);
      await pool(joins, CONCURRENCY, async ({ voter, name }) => {
        await walletFor(voter).writeContract({
          address: COMMUNITY_REGISTRY,
          abi: communityAbi,
          functionName: "join",
          args: [stringToHex(name, { size: 32 })],
        } as never);
      });
      break;
    }

    case "replies": {
      await requireFunds(publicClient, accs.map((a) => a.address), "0.03");
      const PHRASES = [
        "this is the part nobody talks about",
        "disagree, but I see where you are coming from",
        "came here to say exactly this",
        "same thing happened to me last week",
        "do you have a link for that?",
      ];

      for (const [t, topic] of corpus.topics.entries()) {
        const { ids } = await api<{ ids: string[] }>(
          `/candidates?strategy=community&community=${topic.name}&limit=3`,
        );
        if (!ids?.length) continue;
        const root = ids[ids.length - 1];

        // Re-runnable: a sub that already has replies is left alone.
        const existing = await api<{ ids: string[] }>(`/replies/${root}`);
        if (existing.ids?.length) {
          console.log(`  m/${topic.name} already has replies`);
          continue;
        }

        const voters = accs.slice(t * perTopic, (t + 1) * perTopic);
        const idOf = async () =>
          (await publicClient.readContract({
            address: POST_REGISTRY,
            abi: postAbi,
            functionName: "nextPostId",
          })) as bigint;

        let firstReply: bigint | null = null;
        for (let k = 0; k < 3; k++) {
          const voter = voters[(k + 1) % voters.length];
          const id = await idOf();
          const hash = await walletFor(voter).writeContract({
            address: POST_REGISTRY,
            abi: postAbi,
            functionName: "reply",
            args: [BigInt(root), PHRASES[k], ""],
          } as never);
          await publicClient.waitForTransactionReceipt({ hash });
          if (k === 0) firstReply = id;
        }

        // The nested one, so every sub has a thread with a second level.
        const voter = voters[4 % voters.length];
        const hash = await walletFor(voter).writeContract({
          address: POST_REGISTRY,
          abi: postAbi,
          functionName: "reply",
          args: [firstReply!, PHRASES[4], ""],
        } as never);
        await publicClient.waitForTransactionReceipt({ hash });
        console.log(`  m/${topic.name}: 3 replies + 1 nested on ${root}`);
      }
      break;
    }

    case "votes": {
      await requireFunds(publicClient, accs.map((a) => a.address), "0.04");
      type Item = { id: string; author: string; community: string };
      const byCommunity = new Map<string, Item[]>();

      for (const topic of corpus.topics) {
        const { ids } = await api<{ ids: string[] }>(
          `/candidates?strategy=community&community=${topic.name}&limit=1000`,
        );
        if (!ids?.length) continue;
        const { posts } = await api<{ posts: Item[] }>(`/posts?ids=${ids.join(",")}`);
        byCommunity.set(topic.name, posts);
      }
      const all = [...byCommunity.values()].flat();
      console.log(`${all.length} community posts across ${byCommunity.size} subs`);

      const jobs: { voter: HDAccount; id: string; kind: "like" | "dislike" }[] = [];
      const seen = new Set<string>();
      const push = (voter: HDAccount, id: string, kind: "like" | "dislike") => {
        const key = `${voter.address}-${id}-${kind}`;
        if (seen.has(key)) return;
        seen.add(key);
        jobs.push({ voter, id, kind });
      };

      for (const [t, topic] of corpus.topics.entries()) {
        const posts = byCommunity.get(topic.name) ?? [];
        const foreign = all.filter((p) => p.community !== topic.name);
        const voters = accs.slice(t * perTopic, (t + 1) * perTopic);

        for (const [v, voter] of voters.entries()) {
          const mine = voter.address.toLowerCase();
          const others = posts.filter((p) => p.author !== mine);
          for (let k = 0; k < LIKES_PER_VOTER && others.length > 0; k++) {
            push(voter, others[(v * LIKES_PER_VOTER + k) % others.length].id, "like");
          }
          const target = foreign.filter((p) => p.author !== mine);
          for (let k = 0; k < DISLIKES_PER_VOTER && target.length > 0; k++) {
            push(voter, target[(v + t + k) % target.length].id, "dislike");
          }
        }
      }

      console.log(`Writing ${jobs.length} votes`);
      const abi = postAbi;
      await pool(jobs, CONCURRENCY, async ({ voter, id, kind }) => {
        await walletFor(voter).writeContract({
          address: POST_REGISTRY,
          abi,
          functionName: kind,
          args: [BigInt(id)],
        } as never);
      });
      break;
    }

    default:
      throw new Error(
        `Unknown step: ${STEP}. Use fund | handles | subs | posts | joins | replies | votes`,
      );
  }
}

void main();
