import { createHmac, timingSafeEqual } from "node:crypto";
import { Hono, type Context, type Next } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import { isAddress, verifyMessage, type Address, type Hex } from "viem";
import type { Db } from "./db";
import {
  admitAccount, createChallenge, getChallenge, hashToken, initializeInvites,
  invitationsFor, inviteSession, INVITE_SESSION_COOKIE, INVITES_PER_ACCOUNT, redeemInvite,
} from "./invites";

/// The cookie the gate reads, on the web and on the API. It is set once by
/// POST /gate and then verified statelessly by both ends.
export const GATE_COOKIE = "mochi_gate";

/// An upper bound on any cookie the server will honour, so a leaked signing
/// secret cannot be turned into a cookie that outlives the deployment.
const MAX_TTL_SECONDS = 60 * 60 * 24 * 90;

export type Gate = {
  secret: string;
  codes: string[];
  ttlSeconds: number;
  /// A shared parent host for the app and API. Undefined keeps it host-only.
  cookieDomain: string | undefined;
  webOrigin: string;
};

/**
 * The gate as configured, or null when it is off.
 *
 * Off when GATE_SECRET is unset, which is what the unit tests and the local
 * e2e stack rely on. A secret with no codes is still a live gate: it answers,
 * it redirects and it rejects everything, which is the honest reading of a
 * half-configured lock rather than a silent way in.
 */
export function gateFromEnv(env: NodeJS.ProcessEnv = process.env): Gate | null {
  const secret = env.GATE_SECRET?.trim();
  if (!secret) return null;

  const ttl = Number(env.GATE_TTL_SECONDS);
  return {
    secret,
    codes: (env.GATE_CODES ?? "")
      .split(",")
      .map((code) => code.trim())
      .filter(Boolean),
    ttlSeconds: Number.isFinite(ttl) && ttl >= 1 ? Math.min(Math.trunc(ttl), MAX_TTL_SECONDS) : MAX_TTL_SECONDS,
    cookieDomain: env.GATE_COOKIE_DOMAIN?.trim() || undefined,
    webOrigin: (env.GATE_WEB_ORIGIN?.trim() || "http://localhost:3000").replace(/\/+$/, ""),
  };
}

/** The proof of an expiry, as the server brands it. */
export function signGate(expiry: number, secret: string): string {
  return createHmac("sha256", secret).update(String(expiry)).digest("hex");
}

/**
 * The expiry a cookie carries, or null if it is malformed, forged or past.
 *
 * No database and no session table: the API and web middleware share
 * only the secret, and either can answer on its own.
 */
export function verifyGate(
  value: string | undefined,
  secret: string,
  now = Math.floor(Date.now() / 1000),
): number | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot < 1) return null;

  const expiryPart = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  if (!/^\d{1,12}$/.test(expiryPart)) return null;

  const expiry = Number(expiryPart);
  // An expiry already past is spent, and one further out than a cookie could
  // legitimately be is not something this server signed.
  if (expiry <= now || expiry > now + MAX_TTL_SECONDS) return null;

  const expected = signGate(expiry, secret);
  if (signature.length !== expected.length) return null;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ? expiry : null;
}

/** Only a local path, including after URL normalization. */
function safeNext(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\x00-\x20]/.test(value)) return "/";
  return value;
}

export function gateRoutes(gate: Gate, db: Db, allowedOrigins: string[] = [gate.webOrigin]): Hono {
  const app = new Hono();
  initializeInvites(db, gate.codes);
  const attempts = new Map<string, { n: number; until: number }>();
  app.use("/gate/*", bodyLimit({ maxSize: 4096 }));
  app.use("/gate", bodyLimit({ maxSize: 4096 }));
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    if (c.req.method === "POST" && c.req.path.startsWith("/gate")) {
      const origin = c.req.header("origin");
      // The site's no-referrer policy makes a cross-origin native form send
      // Origin: null. Only code redemption accepts that: the one-use code is
      // the credential. Account proofs and logout still require a listed origin.
      const privateForm = origin === "null" && c.req.path === "/gate";
      if (origin && !privateForm && !allowedOrigins.includes(origin)) return c.json({ error: "Origin not allowed." }, 403);
      // Cloudflare supplies this at the tunnel. Never trust X-Forwarded-For.
      const key = hashToken(c.req.header("cf-connecting-ip") ?? "local");
      const now = Date.now();
      for (const [ip, entry] of attempts) if (entry.until <= now) attempts.delete(ip);
      const entry = attempts.get(key) ?? { n: 0, until: now + 60_000 };
      if (++entry.n > 30 || attempts.size >= 10_000 && !attempts.has(key)) {
        c.header("Retry-After", "60");
        return c.json({ error: "Too many attempts. Wait a minute and try again." }, 429);
      }
      attempts.set(key, entry);
    }
    await next();
  });

  const cookieOptions = {
    domain: gate.cookieDomain, path: "/", maxAge: gate.ttlSeconds,
    secure: true, httpOnly: true, sameSite: "Lax" as const,
  };
  function setSession(c: Context, token: string) {
    const expiry = Math.floor(Date.now() / 1000) + gate.ttlSeconds;
    setCookie(c, GATE_COOKIE, `${expiry}.${signGate(expiry, gate.secret)}`, cookieOptions);
    setCookie(c, INVITE_SESSION_COOKIE, token, cookieOptions);
  }

  app.get("/gate/status", c => {
    const open = verifyGate(getCookie(c, GATE_COOKIE), gate.secret) !== null;
    const session = inviteSession(db, getCookie(c, INVITE_SESSION_COOKIE));
    return c.json({ enabled: true, open, address: session?.address ?? null });
  });

  // GET invite links only prefill the form. Link previews never spend a code.
  app.post("/gate", async c => {
    const body = await c.req.parseBody();
    const next = safeNext(body.next);
    const existing = inviteSession(db, getCookie(c, INVITE_SESSION_COOKIE));
    if (existing?.address) return c.redirect(`${gate.webOrigin}${next}`, 303);
    const token = redeemInvite(db, String(body.code ?? ""), gate.ttlSeconds);
    if (!token) return c.redirect(`${gate.webOrigin}/gate/?bad=1${next !== "/" ? `&next=${encodeURIComponent(next)}` : ""}`, 303);
    if (existing) db.prepare("DELETE FROM invite_sessions WHERE token_hash = ?").run(existing.token_hash);
    setSession(c, token);
    return c.redirect(`${gate.webOrigin}${next}`, 303);
  });

  app.post("/gate/challenge", async c => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body.address !== "string" || !isAddress(body.address, { strict: false })) {
      return c.json({ error: "A valid account is required." }, 400);
    }
    const challenge = createChallenge(db, body.address.toLowerCase(), gate.webOrigin, getCookie(c, INVITE_SESSION_COOKIE));
    if (!challenge) return c.json({ error: "Please try again in a few minutes." }, 429);
    return c.json({ id: challenge.id, message: challenge.message });
  });

  app.post("/gate/session", async c => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body.id !== "string" || !/^[a-f0-9]{64}$/.test(body.id)
        || typeof body.signature !== "string" || !/^0x[a-f0-9]{130}$/i.test(body.signature)) {
      return c.json({ error: "Invalid sign-in proof." }, 400);
    }
    const previous = getCookie(c, INVITE_SESSION_COOKIE);
    const challenge = getChallenge(db, body.id, previous);
    const verified = challenge && await verifyMessage({
      address: challenge.address as Address, message: challenge.message, signature: body.signature as Hex,
    }).catch(() => false);
    if (!verified) return c.json({ error: "Sign-in expired or could not be verified. Please try again." }, 401);
    const token = admitAccount(db, body.id, gate.ttlSeconds, previous);
    if (!token) return c.json({ error: "This account needs an invitation. Enter an unused code first." }, 403);
    setSession(c, token);
    return c.json({ open: true, address: challenge!.address });
  });

  app.get("/gate/invites", c => {
    const session = inviteSession(db, getCookie(c, INVITE_SESSION_COOKIE));
    if (!session?.address) return c.json({ error: "Confirm your account to see your invitations." }, 401);
    const codes = invitationsFor(db, session.address);
    return c.json({ address: session.address, allowance: INVITES_PER_ACCOUNT,
      remaining: codes.filter(code => code.usedAt === null).length,
      joined: codes.filter(code => code.usedBy !== null).length, codes });
  });

  function clearSession(c: Context) {
    const token = getCookie(c, INVITE_SESSION_COOKIE);
    if (token) db.prepare("DELETE FROM invite_sessions WHERE token_hash = ?").run(hashToken(token));
    for (const name of [GATE_COOKIE, INVITE_SESSION_COOKIE]) deleteCookie(c, name, cookieOptions);
  }
  app.post("/gate/logout", c => {
    clearSession(c);
    return c.json({ ok: true });
  });
  app.post("/gate/out", c => {
    clearSession(c);
    return c.redirect(`${gate.webOrigin}/gate/`, 303);
  });
  return app;
}

/**
 * Refuses anything that does not carry a valid cookie.
 *
 * /health stays open because the deploy script and any monitor need it to
 * answer before anyone has a code, and it reports only liveness and counts.
 * /gate is how a cookie is obtained in the first place. OPTIONS is let through
 * so a preflight is answered by CORS rather than read as an unauthorised call.
 */
export function gateMiddleware(gate: Gate) {
  return async (c: Context, next: Next) => {
    if (c.req.method === "OPTIONS") return next();

    const path = new URL(c.req.url).pathname;
    if (path === "/health" || path === "/gate" || path.startsWith("/gate/")) return next();

    if (verifyGate(getCookie(c, GATE_COOKIE), gate.secret) !== null) return next();
    return c.json({ error: "This deployment is private. Enter an access code." }, 401);
  };
}
