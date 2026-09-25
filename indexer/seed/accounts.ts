import { formatEther, parseEther, type Address, type PublicClient, type WalletClient } from "viem";
import { mnemonicToAccount, type HDAccount } from "viem/accounts";

/**
 * Wallets come from one mnemonic by index rather than from randomness, so the
 * script can be re-run without funding a fresh set every time. Regenerating
 * content is something that happens repeatedly before a demo.
 */
export function deriveAccounts(mnemonic: string, count: number, offset = 0): HDAccount[] {
  return Array.from({ length: count }, (_, i) =>
    mnemonicToAccount(mnemonic, { addressIndex: offset + i }),
  );
}

/**
 * Tops every account up to `targetEther`, sending only the difference.
 *
 * Topping up to a target rather than sending a flat amount matters once
 * seeding has been run before: a wallet holding 0.04 needs 0.26, not another
 * 0.3, and the flat version would have cost three times as much to refill a
 * network that was only partly drained.
 *
 * Sends sequentially. Nonce management across a burst of parallel sends is a
 * reliable source of confusing failures, and this runs once before a demo
 * rather than in a hot path.
 */
export async function fundAccounts(
  client: WalletClient,
  publicClient: PublicClient,
  addresses: Address[],
  targetEther: string,
): Promise<void> {
  const target = parseEther(targetEther);
  let funded = 0;
  let skipped = 0;
  let spent = 0n;

  for (const address of addresses) {
    const balance = await publicClient.getBalance({ address });
    if (balance >= target) {
      skipped++;
      continue;
    }
    const topUp = target - balance;
    const hash = await client.sendTransaction({ to: address, value: topUp } as never);
    await publicClient.waitForTransactionReceipt({ hash });
    spent += topUp;
    funded++;
    if (funded % 20 === 0) {
      console.log(`  topped up ${funded}, skipped ${skipped}, of ${addresses.length}`);
    }
  }
  console.log(
    `topped ${funded} wallets to ${targetEther} MON (${formatEther(spent)} spent), skipped ${skipped}`,
  );
}

/**
 * Refuses to start a step when wallets are too poor to finish it.
 *
 * An underfunded wallet does not report "out of funds" — the RPC answers
 * "Missing or invalid parameters", the retry loop exhausts itself, and the run
 * ends looking like a network problem. Checking up front turns that into one
 * clear sentence.
 */
export async function requireFunds(
  publicClient: PublicClient,
  addresses: Address[],
  minimumEther: string,
): Promise<void> {
  const minimum = parseEther(minimumEther);
  const poor: Address[] = [];
  for (const address of addresses) {
    if ((await publicClient.getBalance({ address })) < minimum) poor.push(address);
  }
  if (poor.length > 0) {
    throw new Error(
      `${poor.length}/${addresses.length} wallets hold less than ${minimumEther} MON. ` +
        `Run the fund step first — an underfunded wallet fails as "Missing or invalid parameters", not as a funding error.`,
    );
  }
}
