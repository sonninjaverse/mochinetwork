import { describe, expect, it } from "vitest";
import { parseEther } from "viem";
import {
  maxSendable,
  TRANSFER_GAS,
  withdrawError,
  withdrawValue,
  type WithdrawDraft,
} from "@/lib/wallet/transfer";

const GAS_PRICE = 100_000_000_000n; // 100 gwei
const OTHER = "0x1111111111111111111111111111111111111111";
const SELF = "0x2222222222222222222222222222222222222222";

const draft = (over: Partial<WithdrawDraft> = {}): WithdrawDraft => ({
  to: OTHER,
  amount: "1",
  self: SELF,
  balance: parseEther("10"),
  gasPrice: GAS_PRICE,
  ...over,
});

describe("maxSendable", () => {
  it("leaves exactly the gas for one transfer behind", () => {
    expect(maxSendable(parseEther("10"), GAS_PRICE)).toBe(parseEther("10") - TRANSFER_GAS * GAS_PRICE);
  });

  it("is zero when the balance cannot even cover gas", () => {
    expect(maxSendable(1000n, GAS_PRICE)).toBe(0n);
  });

  it("is unknown until the gas price is read", () => {
    expect(maxSendable(parseEther("10"), null)).toBeNull();
  });
});

describe("withdrawError", () => {
  it("accepts a well-formed draft", () => {
    expect(withdrawError(draft())).toBeNull();
  });

  it("accepts a lowercase and checksummed address alike", () => {
    expect(withdrawError(draft({ to: OTHER.toLowerCase() }))).toBeNull();
  });

  it("requires an address, and a real one", () => {
    expect(withdrawError(draft({ to: "" }))).toBe("no-address");
    expect(withdrawError(draft({ to: "alice" }))).toBe("bad-address");
  });

  it("refuses this account's own address", () => {
    expect(withdrawError(draft({ to: SELF }))).toBe("self");
  });

  it("requires a positive amount", () => {
    expect(withdrawError(draft({ amount: "" }))).toBe("no-amount");
    expect(withdrawError(draft({ amount: "0" }))).toBe("bad-amount");
    expect(withdrawError(draft({ amount: "nope" }))).toBe("bad-amount");
  });

  it("refuses more than the balance less gas", () => {
    // 10 MON balance, ~0.0021 MON of gas: 9.999 is plenty, 10 is not.
    expect(withdrawError(draft({ amount: "9.9" }))).toBeNull();
    expect(withdrawError(draft({ amount: "10" }))).toBe("too-much");
  });

  it("waits for the gas price rather than guessing", () => {
    expect(withdrawError(draft({ gasPrice: null }))).toBe("no-gas");
  });
});

describe("withdrawValue", () => {
  it("parses MON into wei", () => {
    expect(withdrawValue("1.5")).toBe(parseEther("1.5"));
  });

  it("trims before parsing", () => {
    expect(withdrawValue("  2  ")).toBe(parseEther("2"));
  });
});
