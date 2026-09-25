import { expect, test } from "vitest";
import { appChain } from "@/lib/chain/config";
import { monadTestnet } from "@social/lib/chain";

// Reads and writes must always target the same chain.
test("the wallet signs for the chain the social feed reads", () => {
  expect(appChain.id).toBe(monadTestnet.id);
  expect(appChain.rpcUrls.default.http[0]).toBe(monadTestnet.rpcUrls.default.http[0]);
});
