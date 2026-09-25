import { defineChain } from "viem";

// Wallet writes and feed reads use the same configuration. Keep env accesses
// literal so Next.js includes their build-time values in the browser bundle.
const chainId = Number(process.env.NEXT_PUBLIC_MONAD_CHAIN_ID || 10143);
const rpcHttp = process.env.NEXT_PUBLIC_MONAD_RPC_HTTP || "https://testnet-rpc.monad.xyz";
const rpcWs = process.env.NEXT_PUBLIC_MONAD_RPC_WS;

export const appChain = defineChain({
  id: chainId,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [rpcHttp], webSocket: rpcWs ? [rpcWs] : [] } },
  blockExplorers: { default: { name: "MonadScan", url: "https://testnet.monadscan.com" } },
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
  },
  testnet: true,
});
