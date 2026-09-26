import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import type { Hono } from "hono";
import { openDb, type Db } from "../src/db";
import { createServer } from "../src/server";
import { initializeInvites, issueCode, hashToken, INVITE_SESSION_COOKIE } from "../src/invites";
import { signGate } from "../src/gate";

const secret = "test-invite-signing-secret";
const origin = "https://social.example";
const alice = privateKeyToAccount(generatePrivateKey());
const bob = privateKeyToAccount(generatePrivateKey());
const eve = privateKeyToAccount(generatePrivateKey());
let db: Db;
let app: Hono;
const cookies = (res: Response) => res.headers.getSetCookie().map(cookie => cookie.split(";")[0]).join("; ");
const post = (path: string, body: unknown, cookie = "") => app.request(path, {
  method: "POST", headers: { "content-type": "application/json", origin, cookie }, body: JSON.stringify(body),
});
const redeem = (code: string) => app.request("/gate", {
  method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin },
  body: new URLSearchParams({ code, next: "/popular" }),
});
async function proof(account = alice, cookie = "") {
  const response = await post("/gate/challenge", { address: account.address }, cookie);
  expect(response.status).toBe(200);
  const { id, message } = await response.json();
  return { id, signature: await account.signMessage({ message }), message };
}
const signIn = async (account = alice, cookie = "") => post("/gate/session", await proof(account, cookie), cookie);
const invites = async (cookie: string) => {
  const res = await app.request("/gate/invites", { headers: { cookie } });
  expect(res.status).toBe(200);
  return res.json();
};

beforeEach(() => {
  vi.stubEnv("GATE_SECRET", secret);
  vi.stubEnv("GATE_CODES", "bootstrap");
  vi.stubEnv("GATE_WEB_ORIGIN", origin);
  vi.stubEnv("GATE_COOKIE_DOMAIN", "social.example");
  db = openDb(":memory:");
  app = createServer(db);
});
afterEach(() => { db.close(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("single-use invitations", () => {
  it("allows exactly one redemption under competing requests and keeps it spent on restart", async () => {
    const responses = await Promise.all([redeem("BOOTSTRAP"), redeem("bootstrap")]);
    expect(responses.filter(res => res.headers.has("set-cookie"))).toHaveLength(1);
    expect(responses.filter(res => res.headers.get("location")?.includes("bad=1"))).toHaveLength(1);
    app = createServer(db);
    expect((await redeem("bootstrap")).headers.has("set-cookie")).toBe(false);
  });

  it("does not spend a code when a link preview reads a URL", async () => {
    await app.request("/gate?code=bootstrap");
    expect((await redeem("bootstrap")).headers.has("set-cookie")).toBe(true);
  });

  it("binds one new wallet, issues three codes once, and shows only that wallet's invitations", async () => {
    const pending = cookies(await redeem("bootstrap"));
    const joined = await signIn(alice, pending);
    expect(joined.status).toBe(200);
    const memberCookie = cookies(joined);
    const first = await invites(memberCookie);
    expect(first).toMatchObject({ remaining: 3, joined: 0, allowance: 3, address: alice.address.toLowerCase() });
    expect(new Set(first.codes.map((code: { code: string }) => code.code)).size).toBe(3);
    const repeat = await signIn(alice);
    expect(repeat.status).toBe(200);
    expect((await invites(cookies(repeat))).codes).toEqual(first.codes);
    const spoof = await app.request(`/gate/invites?address=${bob.address}`, { headers: { cookie: memberCookie } });
    expect((await spoof.json()).address).toBe(alice.address.toLowerCase());
    expect((await app.request("/gate/invites")).status).toBe(401);
  });

  it("records who invited whom and never refills used codes", async () => {
    const owner = cookies(await signIn(alice, cookies(await redeem("bootstrap"))));
    const codes = (await invites(owner)).codes;
    const friend = await signIn(bob, cookies(await redeem(codes[0].code)));
    expect(friend.status).toBe(200);
    const updated = await invites(owner);
    expect(updated).toMatchObject({ remaining: 2, joined: 1 });
    expect(updated.codes.find((code: { code: string }) => code.code === codes[0].code).usedBy).toBe(bob.address.toLowerCase());
    expect(db.prepare("SELECT invited_by FROM invite_members WHERE address = ?").get(bob.address.toLowerCase()))
      .toEqual({ invited_by: alice.address.toLowerCase() });
    expect((await invites(cookies(friend))).remaining).toBe(3);
    await redeem(codes[1].code);
    await redeem(codes[2].code);
    const repeat = cookies(await signIn(alice));
    expect(await invites(repeat)).toMatchObject({ remaining: 0, joined: 1 });
    expect((await invites(repeat)).codes).toHaveLength(3);
  });

  it("does not let two wallets bind the same pending browser session", async () => {
    const pending = cookies(await redeem("bootstrap"));
    const proofs = await Promise.all([proof(alice, pending), proof(bob, pending)]);
    const results = await Promise.all(proofs.map(body => post("/gate/session", body, pending)));
    expect(results.filter(res => res.status === 200)).toHaveLength(1);
    expect(results.filter(res => res.status === 401 || res.status === 403)).toHaveLength(1);
    expect(db.prepare("SELECT count(*) AS n FROM invite_members").get()).toEqual({ n: 1 });
  });
});

describe("account proof and session protection", () => {
  it("refuses an unsigned address, a different wallet's signature, and a stolen challenge from another browser", async () => {
    const pending = cookies(await redeem("bootstrap"));
    expect((await post("/gate/session", { address: alice.address }, pending)).status).toBe(400);
    const p = await proof(alice, pending);
    expect((await post("/gate/session", { id: p.id, signature: await eve.signMessage({ message: p.message }) }, pending)).status).toBe(401);
    expect((await post("/gate/session", p)).status).toBe(401);
    expect((await post("/gate/session", p, pending)).status).toBe(200);
    expect((await post("/gate/session", p, pending)).status).toBe(401);
  });

  it("rejects expired proofs and accounts without admission", async () => {
    const pending = cookies(await redeem("bootstrap"));
    const p = await proof(alice, pending);
    db.prepare("UPDATE invite_challenges SET expires_at = 0 WHERE id = ?").run(p.id);
    expect((await post("/gate/session", p, pending)).status).toBe(401);
    expect((await signIn(bob)).status).toBe(403);
  });

  it("keeps old read cookies working without letting them mint invitations", async () => {
    const expiry = Math.floor(Date.now() / 1000) + 3600;
    const cookie = `mochi_gate=${expiry}.${signGate(expiry, secret)}`;
    expect((await app.request("/posts?ids=1", { headers: { cookie } })).status).toBe(200);
    expect((await app.request("/gate/invites", { headers: { cookie } })).status).toBe(401);
    expect((await signIn(eve, cookie)).status).toBe(403);
  });

  it("stores hashed tokens, scopes private cookies, and revokes sessions on sign-out", async () => {
    const member = await signIn(alice, cookies(await redeem("bootstrap")));
    const cookie = cookies(member);
    for (const value of member.headers.getSetCookie()) {
      expect(value).toContain("HttpOnly"); expect(value).toContain("Secure");
      expect(value).toContain("SameSite=Lax"); expect(value).toContain("Domain=social.example");
    }
    const token = cookie.match(/mochi_invite=([a-f0-9]+)/)![1];
    expect(db.prepare("SELECT token_hash FROM invite_sessions").get()).toEqual({ token_hash: hashToken(token) });
    expect((await app.request("/gate/invites", { headers: { cookie } })).headers.get("cache-control")).toBe("no-store");
    const out = await post("/gate/out", {}, cookie);
    expect(out.status).toBe(303);
    expect(out.headers.getSetCookie().some(value => value.startsWith(`${INVITE_SESSION_COOKIE}=`) && value.includes("Max-Age=0"))).toBe(true);
    expect((await app.request("/gate/invites", { headers: { cookie } })).status).toBe(401);
  });

  it("rejects foreign origins and throttles repeated gate attempts", async () => {
    expect((await app.request("/gate/challenge", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: JSON.stringify({ address: alice.address }) })).status).toBe(403);
    for (let n = 0; n < 30; n++) await redeem("wrong");
    const limited = await redeem("wrong");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
  });
});

it("snapshots existing participants once, without letting later chain activity bypass invitations", async () => {
  db.close(); db = openDb(":memory:");
  db.prepare("INSERT INTO handles (address, handle) VALUES (?, ?)").run(alice.address.toLowerCase(), "alice");
  app = createServer(db);
  expect((await signIn(alice)).status).toBe(200);
  db.prepare("INSERT INTO handles (address, handle) VALUES (?, ?)").run(bob.address.toLowerCase(), "bob");
  initializeInvites(db, ["bootstrap"]);
  expect((await signIn(bob)).status).toBe(403);
});

it("can issue a bootstrap code without assigning extra codes to an existing inviter", async () => {
  const code = issueCode(db);
  expect((await redeem(code)).headers.has("set-cookie")).toBe(true);
  expect((await redeem(code)).headers.has("set-cookie")).toBe(false);
});

it("accepts a private native form but refuses null-origin account and logout requests", async () => {
  const res = await app.request("/gate", { method: "POST", headers: { origin: "null", "content-type": "application/x-www-form-urlencoded" }, body: "code=bootstrap" });
  expect(res.headers.has("set-cookie")).toBe(true);
  for (const path of ["/gate/challenge", "/gate/session", "/gate/logout"]) {
    expect((await app.request(path, { method: "POST", headers: { origin: "null", "content-type": "application/json" }, body: "{}" })).status).toBe(403);
  }
});

it("gives an inviter their code back when an existing member accidentally accepts it", async () => {
  const memberCookie = cookies(await signIn(alice, cookies(await redeem("bootstrap"))));
  const code = (await invites(memberCookie)).codes[0].code;
  const pending = cookies(await redeem(code));
  const returned = await signIn(alice, pending);
  expect(returned.status).toBe(200);
  expect(await invites(cookies(returned))).toMatchObject({ remaining: 3, joined: 0 });
  expect((await redeem(code)).headers.has("set-cookie")).toBe(true);
});

it("JSON logout clears both cookies and prevents reading codes with the old session", async () => {
  const cookie = cookies(await signIn(alice, cookies(await redeem("bootstrap"))));
  const out = await post("/gate/logout", {}, cookie);
  expect(await out.json()).toEqual({ ok: true });
  expect(out.headers.getSetCookie()).toHaveLength(2);
  expect((await app.request("/gate/invites", { headers: { cookie } })).status).toBe(401);
});
