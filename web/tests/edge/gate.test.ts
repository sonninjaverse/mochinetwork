// @vitest-environment node
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { gateAllows, gateExempt } from "@/lib/edge/gate";

const SECRET = "test-secret";
const NOW = 1_800_000_000;

// Exactly what indexer/src/gate.ts signGate() issues from POST /gate, so a
// cookie from the API opens the site with no second code.
const sign = (expiry: number | string, secret = SECRET) =>
  `${expiry}.${createHmac("sha256", secret).update(String(expiry)).digest("hex")}`;

describe("gateAllows", () => {
  it("opens for a cookie the API signed", async () => {
    expect(await gateAllows(sign(NOW + 3600), SECRET, NOW)).toBe(true);
  });

  it("refuses no cookie", async () => {
    expect(await gateAllows(undefined, SECRET, NOW)).toBe(false);
  });

  it("refuses an expired cookie", async () => {
    expect(await gateAllows(sign(NOW), SECRET, NOW)).toBe(false);
  });

  it("refuses one signed with another secret", async () => {
    expect(await gateAllows(sign(NOW + 3600, "other"), SECRET, NOW)).toBe(false);
  });

  // The API never signs past 90 days, so a longer one is not the API's.
  it("refuses an expiry further out than the API ever signs", async () => {
    expect(await gateAllows(sign(NOW + 91 * 86_400), SECRET, NOW)).toBe(false);
  });

  it("refuses malformed values", async () => {
    for (const value of ["", ".", "abc.def", `${NOW + 3600}`, `x${sign(NOW + 3600)}`, `${"9".repeat(13)}.00`]) {
      expect(await gateAllows(value, SECRET, NOW), value).toBe(false);
    }
  });
});

describe("gateExempt", () => {
  it("lets the gate page, assets, and files through", () => {
    for (const path of ["/gate", "/gate/", "/_next/static/x.js", "/sw.js", "/brand/og.png"]) {
      expect(gateExempt(path), path).toBe(true);
    }
  });

  it("gates pages", () => {
    for (const path of ["/", "/m/monad", "/alice"]) {
      expect(gateExempt(path), path).toBe(false);
    }
  });
});
