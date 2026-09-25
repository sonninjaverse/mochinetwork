import { describe, expect, it } from "vitest";
import { getEvmAddress } from "@category-labs/mera";
import { PRF_SALT, sessionFromPrf } from "@/lib/wallet/mera-client";

// Pinned on 2026-09-21 from the social app's derivation, before the wallet
// moved: PRF output -> BIP-39 entropy -> seed -> m/44'/60'/0'/0/0. Every
// existing passkey account is this path. If this test fails, every user has
// silently been given a different address.
describe("key derivation", () => {
  it("derives the pinned address from a fixed PRF output", () => {
    const session = sessionFromPrf(new Uint8Array(32).fill(1));
    expect(getEvmAddress(session.publicKey)).toBe("0x37566338ADFbf56aa41FE8FC38aA92dB1e12aD59");
    session.end();
  });

  it("keeps the salt every account was derived with", () => {
    expect(PRF_SALT).toEqual(new Uint8Array(32).fill(7));
  });
});
