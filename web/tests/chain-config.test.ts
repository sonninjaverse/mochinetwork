// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

test("wallet configuration defaults to Monad testnet", async () => {
  vi.stubEnv("NEXT_PUBLIC_MONAD_CHAIN_ID", "");
  vi.stubEnv("NEXT_PUBLIC_MONAD_RPC_HTTP", "");
  vi.resetModules();
  const { appChain } = await import("@/lib/chain/config");
  expect(appChain.id).toBe(10143);
  expect(appChain.rpcUrls.default.http[0]).toBe("https://testnet-rpc.monad.xyz");
  expect(appChain.nativeCurrency).toEqual({ name: "MON", symbol: "MON", decimals: 18 });
});

test("wallet configuration follows the social network environment", async () => {
  vi.stubEnv("NEXT_PUBLIC_MONAD_CHAIN_ID", "31337");
  vi.stubEnv("NEXT_PUBLIC_MONAD_RPC_HTTP", "http://127.0.0.1:8545");
  vi.stubEnv("NEXT_PUBLIC_MONAD_RPC_WS", "ws://127.0.0.1:8545");
  vi.resetModules();
  const { appChain } = await import("@/lib/chain/config");
  expect(appChain.id).toBe(31337);
  expect(appChain.rpcUrls.default.http).toEqual(["http://127.0.0.1:8545"]);
  expect(appChain.rpcUrls.default.webSocket).toEqual(["ws://127.0.0.1:8545"]);
});
