import { afterEach, expect, test, vi } from "vitest";

const ADDRESS = "0x000000000000000000000000000000000000dEaD";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

test("with no address configured there is no faucet to offer", async () => {
  vi.stubEnv("NEXT_PUBLIC_FAUCET", "");
  const { faucetConfigured, hasClaimed } = await import("./faucet");
  expect(faucetConfigured()).toBe(false);
  expect(await hasClaimed(ADDRESS)).toBe(true);
});

test("a configured address turns the faucet on", async () => {
  vi.stubEnv("NEXT_PUBLIC_FAUCET", "0x00000000000000000000000000000000000000F4");
  const { faucetConfigured } = await import("./faucet");
  expect(faucetConfigured()).toBe(true);
});

test("a malformed address is treated as no faucet at all", async () => {
  vi.stubEnv("NEXT_PUBLIC_FAUCET", "not-an-address");
  const { faucetConfigured } = await import("./faucet");
  expect(faucetConfigured()).toBe(false);
});

test("the contract's refusals are recognised through the error chain", async () => {
  vi.stubEnv("NEXT_PUBLIC_FAUCET", "");
  const { isAlreadyClaimed, isFaucetEmpty } = await import("./faucet");

  const wrapped = new Error("wrapped", {
    cause: { message: 'reverted with custom error "AlreadyClaimed()"' },
  });
  expect(isAlreadyClaimed(wrapped)).toBe(true);
  expect(isFaucetEmpty(wrapped)).toBe(false);

  expect(isFaucetEmpty({ details: "execution reverted: Empty()" })).toBe(true);
  expect(isAlreadyClaimed(new Error("network down"))).toBe(false);
});
