import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb } from "../src/db";
import { GATE_COOKIE, signGate, verifyGate } from "../src/gate";
import { createServer } from "../src/server";

const SECRET = "s3cret-signing-key";
const now = Math.floor(Date.now() / 1000);

it("accepts a cookie the same secret signed", () => {
  const expiry = now + 3600;
  expect(verifyGate(`${expiry}.${signGate(expiry, SECRET)}`, SECRET, now)).toBe(expiry);
});

it("rejects a signature made with another secret", () => {
  const expiry = now + 3600;
  expect(verifyGate(`${expiry}.${signGate(expiry, "other")}`, SECRET, now)).toBe(null);
});

it("rejects a cookie whose expiry has passed", () => {
  const expiry = now - 1;
  expect(verifyGate(`${expiry}.${signGate(expiry, SECRET)}`, SECRET, now)).toBe(null);
});

it("rejects a tampered expiry", () => {
  const signed = signGate(now + 3600, SECRET);
  expect(verifyGate(`${now + 7200}.${signed}`, SECRET, now)).toBe(null);
});

it("rejects a cookie with no signature at all", () => {
  expect(verifyGate(`${now + 3600}`, SECRET, now)).toBe(null);
  expect(verifyGate(undefined, SECRET, now)).toBe(null);
});

// The gate is only real if the API it guards actually refuses an unauthenticated
// caller — a signing function that works proves nothing on its own.
describe("the API behind the gate", () => {
  beforeEach(() => {
    process.env.GATE_SECRET = SECRET;
    process.env.GATE_CODES = "alpha, beta";
    process.env.GATE_WEB_ORIGIN = "https://social.example";
  });
  afterEach(() => {
    delete process.env.GATE_SECRET;
    delete process.env.GATE_CODES;
    delete process.env.GATE_WEB_ORIGIN;
  });

  const cookie = (expiry = now + 3600) => `${GATE_COOKIE}=${expiry}.${signGate(expiry, SECRET)}`;

  it("refuses a request with no cookie", async () => {
    const res = await createServer(openDb(":memory:")).request("/posts?ids=1");
    expect(res.status).toBe(401);
  });

  it("answers a request with a valid cookie", async () => {
    const res = await createServer(openDb(":memory:")).request("/posts?ids=1", {
      headers: { cookie: cookie() },
    });
    expect(res.status).toBe(200);
  });

  it("keeps /health open so a monitor can see the service", async () => {
    const res = await createServer(openDb(":memory:")).request("/health");
    expect(res.status).toBe(200);
  });

  it("turns away a wrong code instead of setting a cookie", async () => {
    const res = await createServer(openDb(":memory:")).request("/gate", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "code=guess",
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://social.example/gate/?bad=1");
    expect(res.headers.get("set-cookie")).toBe(null);
  });

  it("sets a scoped cookie for a good code and returns the reader where they were", async () => {
    const res = await createServer(openDb(":memory:")).request("/gate", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "code=alpha&next=%2Fm%2Fmonad%2F",
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://social.example/m/monad/");
    const set = res.headers.get("set-cookie") ?? "";
    expect(set).toContain(`${GATE_COOKIE}=`);
    expect(set).toContain("HttpOnly");
    expect(set).toContain("Secure");
    expect(set).toContain("SameSite=Lax");
  });

  it("refuses to be redirected off-site by a crafted next", async () => {
    const res = await createServer(openDb(":memory:")).request("/gate", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "code=beta&next=%2F%2Fevil.com",
    });
    expect(res.headers.get("location")).toBe("https://social.example/");
  });
});
