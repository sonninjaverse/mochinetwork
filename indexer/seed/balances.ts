/** Reports seed wallet balances, so a run that fails on funds says so clearly. */
import { createPublicClient, defineChain, formatEther, http } from "viem";
import { mnemonicToAccount } from "viem/accounts";

const chain = defineChain({
  id: Number(process.env.MONAD_CHAIN_ID),
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [process.env.MONAD_RPC_HTTP!] } },
});
const client = createPublicClient({ chain, transport: http(process.env.MONAD_RPC_HTTP!) });

async function main() {
  const balances: bigint[] = [];
  for (let i = 0; i < 120; i++) {
    const a = mnemonicToAccount(process.env.SEED_MNEMONIC!, { addressIndex: i }).address;
    balances.push(await client.getBalance({ address: a }));
  }
  const sorted = [...balances].sort((a, b) => (a < b ? -1 : 1));
  const empty = balances.filter((b) => b < 10n ** 16n).length; // under 0.01 MON
  console.log(`lowest  ${formatEther(sorted[0])} MON`);
  console.log(`median  ${formatEther(sorted[60])} MON`);
  console.log(`highest ${formatEther(sorted[119])} MON`);
  console.log(`under 0.01 MON: ${empty}/120 wallets`);
}

void main();
