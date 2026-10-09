import { Hono } from "hono";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  http,
  isAddress,
  parseEther,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Db } from "./db";

/**
 * A starter drip for new accounts.
 *
 * A wallet created here has no MON, and on Monad every first step — claiming
 * from the faucet included, since a claim is a transaction — costs gas. The
 * drip hands a new address 0.05 MON once so that door is open; it is deliberately
 * small, because the faucet is what gives real spending money, and this only
 * pays the way to it.
 *
 * Sent from a dedicated wallet rather than the deployer: a leak costs the
 * float, not everything. The address is tracked in the local database, so a
 * drip is once per address like the faucet claim, and a wallet that already
 * has gas is left alone.
 */

const AMOUNT_DEFAULT = "0.05";
/// At or above this the address is already funded; the drip is skipped rather
/// than spent.
const ALREADY_FUNDED = parseEther("0.02");
/// Kept on the drip wallet for its own fees, so the last drip can still go out.
const GAS_RESERVE = parseEther("0.02");

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 6;
const HOUR_WINDOW_MS = 3_600_000;
const HOUR_MAX = 60;

function amountToSend(): bigint {
  try {
    return parseEther(process.env.DRIP_AMOUNT ?? AMOUNT_DEFAULT);
  } catch {
    return parseEther(AMOUNT_DEFAULT);
  }
}

function build(key: string) {
  const account = privateKeyToAccount(key as `0x${string}`);
  const chain = defineChain({
    id: Number(process.env.MONAD_CHAIN_ID ?? 10143),
    name: "Monad Testnet",
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [process.env.MONAD_RPC_HTTP ?? "https://testnet-rpc.monad.xyz"] } },
    testnet: true,
  });
  const transport = http(process.env.MONAD_RPC_HTTP);
  return {
    account,
    publicClient: createPublicClient({ chain, transport }),
    wallet: createWalletClient({ account, chain, transport }),
  };
}

let cached: (ReturnType<typeof build> & { key: string }) | null = null;

function clients(key: string) {
  if (!cached || cached.key !== key) cached = { key, ...build(key) };
  return cached;
}

/** One drip per address, recorded here rather than guessed from the chain. */
function alreadyDripped(db: Db, address: string): boolean {
  return Boolean(db.prepare("SELECT 1 FROM starter_drips WHERE address = ?").get(address));
}

export function dripRoutes(db: Db) {
  const app = new Hono();
  // Per-caller and global windows, in memory. The database blocks one drip
  // per address; these stop a single caller from walking through addresses.
  const perCaller = new Map<string, number[]>();
  let hourly: number[] = [];
  const inFlight = new Set<string>();

  function allowed(caller: string): boolean {
    const now = Date.now();
    const recent = (perCaller.get(caller) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
    if (recent.length >= RATE_MAX) return false;
    recent.push(now);
    perCaller.set(caller, recent);

    hourly = hourly.filter((t) => now - t < HOUR_WINDOW_MS);
    if (hourly.length >= HOUR_MAX) return false;
    hourly.push(now);
    return true;
  }

  app.post("/drip", async (c) => {
    const key = process.env.DRIP_PRIVATE_KEY ?? "";
    if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
      return c.json({ error: "starter funds are not configured" }, 503);
    }

    const body = (await c.req.json().catch(() => null)) as { address?: string } | null;
    const raw = String(body?.address ?? "");
    if (!isAddress(raw)) return c.json({ error: "invalid address" }, 400);
    const address = raw.toLowerCase();

    const caller = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "local";
    if (!allowed(caller)) return c.json({ error: "too many requests" }, 429);

    if (alreadyDripped(db, address)) return c.json({ ok: true, already: true });
    if (inFlight.has(address)) return c.json({ ok: true, pending: true });
    inFlight.add(address);

    const amount = amountToSend();
    const { publicClient, wallet } = clients(key);

    try {
      const balance = await publicClient.getBalance({ address: raw as Address });
      if (balance >= ALREADY_FUNDED) return c.json({ ok: true, funded: true });

      const float = await publicClient.getBalance({ address: wallet.account.address });
      if (float < amount + GAS_RESERVE) {
        return c.json({ error: "the starter float is empty" }, 503);
      }

      const hash = await wallet.sendTransaction({ to: raw as Address, value: amount });
      const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
      if (receipt.status !== "success") {
        return c.json({ error: "the starter transfer did not confirm" }, 502);
      }

      db.prepare(
        "INSERT OR IGNORE INTO starter_drips (address, tx_hash, amount, created_at) VALUES (?, ?, ?, ?)",
      ).run(address, hash, formatEther(amount), Date.now());

      return c.json({ ok: true, txHash: hash, amount: formatEther(amount) });
    } catch {
      return c.json({ error: "could not send the starter MON" }, 502);
    } finally {
      inFlight.delete(address);
    }
  });

  return app;
}
