/**
 * Creates a dedicated faucet wallet and funds it from the deployer.
 *
 * The faucet key sits on a server that runs continuously, so it is the key most
 * likely to leak. Keeping it separate from the deployer means a leak costs the
 * float rather than everything — and the float is sized for the demo, not for
 * the project.
 */
import { writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, formatEther, http, parseEther } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const chain = defineChain({
  id: Number(process.env.MONAD_CHAIN_ID),
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [process.env.MONAD_RPC_HTTP!] } },
});
const rpc = process.env.MONAD_RPC_HTTP!;
const publicClient = createPublicClient({ chain, transport: http(rpc) });

const AMOUNT = parseEther(process.env.FAUCET_FLOAT ?? "20");

async function main() {
  const key = generatePrivateKey();
  const faucet = privateKeyToAccount(key);

  const deployerKey = process.env.TEAM_PRIVATE_KEY!;
  const deployer = createWalletClient({
    account: privateKeyToAccount(
      (deployerKey.startsWith("0x") ? deployerKey : `0x${deployerKey}`) as `0x${string}`,
    ),
    chain,
    transport: http(rpc),
  });

  const hash = await deployer.sendTransaction({ to: faucet.address, value: AMOUNT });
  await publicClient.waitForTransactionReceipt({ hash });

  writeFileSync("faucet.key", `${key}\n`, { mode: 0o600 });

  console.log(`faucet   ${faucet.address}`);
  console.log(`funded   ${formatEther(AMOUNT)} MON`);
  console.log(`key      written to indexer/faucet.key (gitignored, mode 600)`);
  console.log(`\nAt 0.05 MON per account that covers ${Number(AMOUNT / parseEther("0.05"))} sign-ups.`);
}

void main();
