import { createHmac, timingSafeEqual } from "node:crypto";
import { Hono, type Context, type Next } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

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
    ttlSeconds: Number.isFinite(ttl) && ttl > 0 ? Math.min(Math.trunc(ttl), MAX_TTL_SECONDS) : MAX_TTL_SECONDS,
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

/// A code that matches, checked in constant time per candidate so a wrong code
/// cannot be narrowed down a character at a time by watching how long the
/// answer took.
function matchCode(candidate: string, codes: string[]): boolean {
  const given = Buffer.from(candidate);
  let hit = false;
  for (const code of codes) {
    const known = Buffer.from(code);
    // timingSafeEqual throws on length mismatch, so keep the lengths equal
    // before comparing and let every candidate do the same amount of work.
    if (given.length === known.length && timingSafeEqual(given, known)) hit = true;
  }
  return hit;
}

/// A path on this site, never another host: `//evil.com` is a path to a
/// browser, so refusing it is the whole open-redirect defence.
function safeNext(value: unknown): string {
  const next = typeof value === "string" ? value : "";
  return next === "/" || /^\/[^/\\]/.test(next) ? next : "/";
}

export function gateRoutes(gate: Gate): Hono {
  const app = new Hono();

  /// Whether an existing cookie still opens the gate, so a page can send the
  /// reader to /gate/ only when it has to.
  app.get("/gate/status", (c) => {
    const open = verifyGate(getCookie(c, GATE_COOKIE), gate.secret) !== null;
    return c.json({ open }, open ? 200 : 401);
  });

  /// A native cross-origin form post, not a fetch: the browser accepts the
  /// Set-Cookie without CORS credentials, and the 303 turns the POST into a
  /// plain navigation to wherever the reader was going.
  app.post("/gate", async (c) => {
    const body = await c.req.parseBody();
    if (!matchCode(String(body.code ?? ""), gate.codes)) {
      return c.redirect(`${gate.webOrigin}/gate/?bad=1`, 303);
    }

    const expiry = Math.floor(Date.now() / 1000) + gate.ttlSeconds;
    setCookie(c, GATE_COOKIE, `${expiry}.${signGate(expiry, gate.secret)}`, {
      domain: gate.cookieDomain,
      path: "/",
      maxAge: gate.ttlSeconds,
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    });
    return c.redirect(`${gate.webOrigin}${safeNext(body.next)}`, 303);
  });

  app.post("/gate/out", (c) => {
    deleteCookie(c, GATE_COOKIE, { domain: gate.cookieDomain, path: "/" });
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
