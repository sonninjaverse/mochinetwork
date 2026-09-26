/** Real contracts + real indexer on a disposable local chain, never a public RPC. */
import { spawn, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createPublicClient, createWalletClient, defineChain, encodeAbiParameters, http, keccak256, numberToHex, stringToHex, type Address, type Hex } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { openDb } from "../src/db";
import { backfill } from "../src/ingest";
import { createServer } from "../src/server";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const rpc = "http://127.0.0.1:8547";
const invites = process.env.E2E_INVITES === "1";
const origin = invites ? "http://localhost:3107" : "http://127.0.0.1:3107";
const chain = defineChain({ id: 31337, name: "Local E2E", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
// Anvil's public fixture mnemonic. These accounts exist only on this local chain.
const mnemonic = "test test test test test test test test test test test junk";
const alice = mnemonicToAccount(mnemonic);
const bob = mnemonicToAccount(mnemonic, { addressIndex: 1 });
const client = createPublicClient({ chain, transport: http(rpc), pollingInterval: 100 });
const wallet = createWalletClient({ chain, account: alice, transport: http(rpc) });
const children = new Set<ChildProcess>();
let closing = false;
function cleanup() { if (closing) return; closing = true; for (const child of children) child.kill("SIGTERM"); }
process.on("SIGTERM", () => { cleanup(); process.exit(0); });
process.on("SIGINT", () => { cleanup(); process.exit(0); });
process.on("exit", cleanup);

function run(command: string, args: string[], cwd: string, env = process.env) {
  return new Promise<void>((done, fail) => {
    const child = spawn(command, args, { cwd, env, stdio: "inherit" });
    children.add(child);
    child.on("error", fail);
    child.on("exit", code => { children.delete(child); code === 0 ? done() : fail(new Error(`${command} exited ${code}`)); });
  });
}
async function artifact(name: string) {
  return JSON.parse(await readFile(join(root, "contracts/out", `${name}.sol`, `${name}.json`), "utf8"));
}
async function deploy(name: string, args: unknown[] = []): Promise<Address> {
  const a = await artifact(name);
  const hash = await wallet.deployContract({ abi: a.abi, bytecode: a.bytecode.object, args });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress) throw new Error(`Deploy ${name} failed`);
  return receipt.contractAddress;
}
async function write(name: string, address: Address, functionName: string, args: unknown[], account = alice) {
  const hash = await wallet.writeContract({ account, address, abi: (await artifact(name)).abi, functionName, args });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} failed`);
}

async function main() {
  // Refuse to reuse a node: the fixture owns every transaction it is about to send.
  if (await fetch(rpc, { method: "POST", body: "{}" }).then(() => true, () => false)) throw new Error("E2E port 8547 is already in use");
  const anvil = spawn("anvil", ["--host", "127.0.0.1", "--port", "8547", "--chain-id", "31337", "--silent"], { stdio: "inherit" });
  children.add(anvil);
  anvil.on("error", e => { throw e; });
  anvil.on("exit", code => { if (!closing) { console.error(`Anvil exited ${code}`); cleanup(); process.exit(1); } });
  for (let attempt = 0; ; attempt++) {
    try { await client.getChainId(); break; }
    catch { if (attempt === 30) throw new Error("Local chain did not start"); await new Promise(r => setTimeout(r, 200)); }
  }
  await run("forge", ["build", "--quiet"], join(root, "contracts"));
  const identity = await deploy("IdentityRegistry");
  // Communities first: PostRegistry is told who to ask about membership.
  const community = await deploy("CommunityRegistry");
  const posts = await deploy("PostRegistry", [community]);
  // A fresh account's vote is one per cent until it has earned karma. The
  // fixture's two accounts stand in for trusted ones: karma 50 is weight 100,
  // written straight into storage so the votes in this fixture carry a whole
  // vote and the ranking and karma tests mean what they say.
  const karmaSlot = (who: Address) =>
    keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [who, 6n]));
  // Only the voter: alice is the author whose karma the test reads, and she
  // must start at zero.
  await client.request({
    method: "anvil_setStorageAt" as never,
    params: [posts, karmaSlot(bob.address), numberToHex(50n, { size: 32 })] as never,
  });
  const now = (await client.getBlock()).timestamp;
  const hot = await deploy("HotFeed", [posts, now]);
  const best = await deploy("BestFeed", [posts]);
  const registry = await deploy("AlgorithmRegistry", [hot, best]);
  for (const name of ["ChronoFeed", "ControversialFeed"]) {
    await write("AlgorithmRegistry", registry, "register", [await deploy(name, [posts])]);
  }
  // Use viem's bundled Multicall3 deployment bytecode, just as the browser does.
  const require = createRequire(import.meta.url);
  const constants = resolve(dirname(require.resolve("viem")), "../_esm/constants/contracts.js");
  const { multicall3Bytecode } = await import(pathToFileURL(constants).href);
  const multiReceipt = await client.waitForTransactionReceipt({ hash: await wallet.deployContract({ abi: [], bytecode: multicall3Bytecode as Hex }) });
  const code = await client.getCode({ address: multiReceipt.contractAddress! });
  await client.request({ method: "anvil_setCode" as never, params: ["0xcA11bde05977b3631167028862bE2a173976CA11", code] as never });

  await write("IdentityRegistry", identity, "register", [stringToHex("alice", { size: 32 }), ""]);
  await write("IdentityRegistry", identity, "register", [stringToHex("bob", { size: 32 }), ""], bob);
  await write("CommunityRegistry", community, "create", [stringToHex("monad", { size: 32 }), 'data:application/json,%7B%22description%22%3A%22Talk%20about%20Monad%22%7D']);
  await write("CommunityRegistry", community, "join", [stringToHex("monad", { size: 32 })]);
  // Joined above, so the contract accepts a post into m/monad.
  await write("PostRegistry", posts, "postToCommunity", [stringToHex("monad", { size: 32 }), "A useful first post", ""]);
  await write("PostRegistry", posts, "like", [1n], bob);
  await write("PostRegistry", posts, "post", ["A newer post outside any community", ""], bob);
  await write("PostRegistry", posts, "reply", [1, "A reply with negative karma", ""]);
  await write("PostRegistry", posts, "dislike", [3n], bob);
  await client.request({ method: "evm_increaseTime" as never, params: [5] as never });
  await write("PostRegistry", posts, "postToCommunity", [stringToHex("monad", { size: 32 }), "Another useful post", ""]);
  await write("PostRegistry", posts, "like", [4n], bob);
  await client.request({ method: "evm_increaseTime" as never, params: [30] as never });
  await write("PostRegistry", posts, "post", ["The newest unvoted post", ""], bob);
  // A reply to the reply, so the thread has something to nest and the comment
  // tree has a second level to render.
  await write("PostRegistry", posts, "reply", [3, "A nested reply to the reply", ""], bob);

  const db = openDb(":memory:");
  const addresses = [identity, posts, community];
  let indexed = await client.getBlockNumber({ cacheTime: 0 });
  await backfill(db, client, 0n, indexed, 100, addresses);
  let syncing = false;
  const interval = setInterval(async () => {
    if (syncing) return;
    syncing = true;
    try {
      const head = await client.getBlockNumber({ cacheTime: 0 });
      if (head > indexed) { await backfill(db, client, indexed + 1n, head, 100, addresses); indexed = head; }
    } catch (e) { console.error(e); }
    finally { syncing = false; }
  }, 150);
  interval.unref();

  const web = join(root, "web");
  const indexerUrl = invites ? "http://localhost:3109" : "http://127.0.0.1:3109";
  process.env.GATE_SECRET = invites ? "local-invite-fixture-secret" : "";
  if (invites) {
    process.env.GATE_CODES = "e2e-desktop,e2e-mobile";
    process.env.GATE_WEB_ORIGIN = origin;
    process.env.GATE_COOKIE_DOMAIN = "";
  }
  const env = {
    ...process.env,
    // Both the feed and wallet use the disposable local chain.
    NEXT_PUBLIC_MONAD_CHAIN_ID: "31337", NEXT_PUBLIC_MONAD_RPC_HTTP: rpc, NEXT_PUBLIC_MONAD_RPC_WS: "",
    NEXT_PUBLIC_IDENTITY_REGISTRY: identity, NEXT_PUBLIC_POST_REGISTRY: posts,
    NEXT_PUBLIC_ALGORITHM_REGISTRY: registry, NEXT_PUBLIC_COMMUNITY_REGISTRY: community,
    NEXT_PUBLIC_INDEXER_URL: indexerUrl, NEXT_PUBLIC_WALLET: invites ? "mera" : "burner",
    GATE_SECRET: process.env.GATE_SECRET,
  };
  await run("pnpm", ["build"], web, env);
  // Exercise the production deployment artifact: the
  // standalone server out of web/release, not `next start` on the source tree.
  await run("pnpm", ["release"], web, env);

  const next = spawn("node", ["release/server.js"], {
    cwd: web,
    env: { ...env, PORT: "3107", HOSTNAME: "127.0.0.1" },
    stdio: "inherit",
  });
  children.add(next);
  for (let attempt = 0; ; attempt++) {
    const up = await fetch(origin).then(r => r.status < 500, () => false);
    if (up) break;
    if (attempt === 150) throw new Error("The app did not start");
    await new Promise(r => setTimeout(r, 200));
  }

  // The indexer answers on its own port, which the app is told through
  // NEXT_PUBLIC_INDEXER_URL; 127.0.0.1:3107 is already an allowed origin.
  const api = new Hono();
  api.get("/__ready", c => c.json({ ready: true }));
  api.route("/", createServer(db));
  serve({ fetch: api.fetch, hostname: "127.0.0.1", port: 3109 });
  console.log(`Local E2E stack ready at ${origin}`);
}

main().catch(e => { console.error(e); cleanup(); process.exit(1); });
