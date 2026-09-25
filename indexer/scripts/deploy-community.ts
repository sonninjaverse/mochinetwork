/** Deploys only CommunityRegistry. Omit --broadcast for a read-only gas estimate. */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, defineChain, formatEther, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const rpc = process.env.MONAD_TESTNET_RPC;
if (!rpc || !process.env.PRIVATE_KEY) throw new Error("Load contracts/.env before deploying");
const chain = defineChain({ id: 10143, name: "Monad Testnet", testnet: true,
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const key = process.env.PRIVATE_KEY.trim();
const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);
const client = createPublicClient({ chain, transport: http(rpc) });
const receiptFile = resolve(root, "contracts/abi/community-deployment.json");

async function main() {
  if (await client.getChainId() !== 10143) throw new Error("Refusing to deploy outside Monad testnet");
  const artifact = JSON.parse(await readFile(resolve(root, "contracts/out/CommunityRegistry.sol/CommunityRegistry.json"), "utf8"));
  const previous = await readFile(receiptFile, "utf8").then(JSON.parse, () => null);
  if (previous) {
    if (await client.getCode({ address: previous.address }) !== artifact.deployedBytecode.object) {
      throw new Error("Existing deployment has different bytecode; inspect it before deploying again");
    }
    console.log(JSON.stringify({ ...previous, verifiedRuntime: true }));
    return;
  }
  const gas = await client.estimateGas({ account, data: artifact.bytecode.object });
  const gasPrice = await client.getGasPrice();
  console.log(JSON.stringify({ chainId: 10143, deployer: account.address, estimatedGas: gas.toString(),
    estimatedMON: formatEther(gas * gasPrice), balanceMON: formatEther(await client.getBalance({ address: account.address })) }));
  if (!process.argv.includes("--broadcast")) return;
  const wallet = createWalletClient({ account, chain, transport: http(rpc) });
  const hash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object });
  console.log(`Submitted ${hash}`);
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== "success" || !receipt.contractAddress) throw new Error("Deployment failed");
  const address = receipt.contractAddress as Address;
  const record = { chainId: 10143, address, deployer: account.address, transactionHash: hash,
    blockNumber: receipt.blockNumber.toString(), gasUsed: receipt.gasUsed.toString() };
  // Persist the receipt before subsequent RPC reads, so a retry cannot redeploy.
  await writeFile(receiptFile, JSON.stringify(record, null, 2) + "\n");
  if (await client.getCode({ address }) !== artifact.deployedBytecode.object) throw new Error("Runtime bytecode mismatch");
  console.log(JSON.stringify({ ...record, verifiedRuntime: true }));
}

main().catch(error => { console.error(error.shortMessage ?? error.message); process.exitCode = 1; });
