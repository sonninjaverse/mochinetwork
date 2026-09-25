import { beforeEach, expect, test, vi } from "vitest";
import type { Abi } from "viem";

const sent = vi.hoisted(() => ({ calls: [] as Record<string, unknown>[] }));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createWalletClient: () => ({
      writeContract: async (call: Record<string, unknown>) => {
        sent.calls.push(call);
        return `0x${"ab".repeat(32)}`;
      },
    }),
  };
});

vi.mock("@/lib/wallet/mera-client", () => ({
  loadAccount: async () => ({
    session: { end: () => {} },
    account: { address: "0x00000000000000000000000000000000000000A1" },
  }),
  createAccount: async () => ({
    session: { end: () => {} },
    account: { address: "0x00000000000000000000000000000000000000A1" },
  }),
}));

import { createBurnerAdapter } from "@/lib/wallet/burner";
import { createMeraAdapter } from "@/lib/wallet/mera";

const CALL = {
  address: "0x1111111111111111111111111111111111111111",
  abi: [] as Abi,
  functionName: "donate",
  args: [1n, 0n, "0x2222222222222222222222222222222222222222"],
  value: 5n,
} as const;

beforeEach(() => {
  sent.calls.length = 0;
});

// Payable contract calls must forward their native value without alteration.
test("the passkey wallet sends the call's value", async () => {
  await createMeraAdapter().write(CALL);
  expect(sent.calls[0]).toMatchObject({ functionName: "donate", value: 5n });
});

test("the burner wallet sends the call's value", async () => {
  await createBurnerAdapter().write(CALL);
  expect(sent.calls[0]).toMatchObject({ functionName: "donate", value: 5n });
});
