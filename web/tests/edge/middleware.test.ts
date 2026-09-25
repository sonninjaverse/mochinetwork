// @vitest-environment node
import { createHmac } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../../middleware";

const sign = (expiry: number) =>
  `${expiry}.${createHmac("sha256", "s3cret").update(String(expiry)).digest("hex")}`;

afterEach(() => vi.unstubAllEnvs());

function request(path: string, cookie?: string) {
  return new NextRequest(`https://social.example${path}`, {
    headers: cookie ? { cookie: `mochi_gate=${cookie}` } : {},
  });
}

test("with no secret the gate is off", async () => {
  vi.stubEnv("GATE_SECRET", "");
  const response = await middleware(request("/m/monad"));
  expect(response.status).toBe(200);
});

test("a page without the cookie goes to the gate, keeping where it was headed", async () => {
  vi.stubEnv("GATE_SECRET", "s3cret");
  const response = await middleware(request("/m/monad"));
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("https://social.example/gate?next=%2Fm%2Fmonad");
});


test("the API's cookie opens the site", async () => {
  vi.stubEnv("GATE_SECRET", "s3cret");
  const response = await middleware(request("/m/monad", sign(Math.floor(Date.now() / 1000) + 3600)));
  expect(response.status).toBe(200);
});

test("the gate page itself is never gated", async () => {
  vi.stubEnv("GATE_SECRET", "s3cret");
  expect((await middleware(request("/gate"))).status).toBe(200);
});

test("every page response carries a fresh nonce CSP and the security headers", async () => {
  vi.stubEnv("GATE_SECRET", "");
  const first = await middleware(request("/"));
  const second = await middleware(request("/"));
  const nonceOf = (csp: string | null) => csp?.match(/'nonce-([^']+)'/)?.[1];

  expect(nonceOf(first.headers.get("content-security-policy"))).toBeTruthy();
  expect(nonceOf(first.headers.get("content-security-policy"))).not.toBe(
    nonceOf(second.headers.get("content-security-policy")),
  );
  expect(first.headers.get("permissions-policy")).toContain("publickey-credentials-get=(self)");
  expect(first.headers.get("x-frame-options")).toBe("DENY");
});

test("the gate's redirect carries the headers too", async () => {
  vi.stubEnv("GATE_SECRET", "s3cret");
  const response = await middleware(request("/m/monad"));
  expect(response.headers.get("strict-transport-security")).toBe("max-age=31536000; includeSubDomains");
});



// The invite gate posts a plain form to the indexer, another origin.
test("the page's CSP lets forms post to the indexer", async () => {
  vi.stubEnv("GATE_SECRET", "");
  vi.stubEnv("NEXT_PUBLIC_INDEXER_URL", "https://api.social.example");
  const response = await middleware(request("/"));
  const formAction = response.headers
    .get("content-security-policy")
    ?.split("; ")
    .find((d) => d.startsWith("form-action"));
  expect(formAction).toBe("form-action 'self' https://api.social.example");
});

// The community header and about panel fetch() their metadata from the gateway.
test("the page's CSP lets scripts fetch from the IPFS gateway", async () => {
  vi.stubEnv("GATE_SECRET", "");
  vi.stubEnv("NEXT_PUBLIC_IPFS_GATEWAY", "https://gateway.pinata.cloud/ipfs/");
  const response = await middleware(request("/"));
  const connectSrc = response.headers
    .get("content-security-policy")
    ?.split("; ")
    .find((d) => d.startsWith("connect-src"));
  expect(connectSrc?.split(" ")).toContain("https://gateway.pinata.cloud");
});

// On the VPS the app answers plain http on 127.0.0.1:3100; the Cloudflare
// tunnel says what the visitor asked for in Host and X-Forwarded-Proto.
function tunnelled(path: string) {
  return new NextRequest(`http://127.0.0.1:3100${path}`, {
    headers: { host: "social.example", "x-forwarded-proto": "https" },
  });
}

test("behind the tunnel the gate sends the visitor to the public https origin", async () => {
  vi.stubEnv("GATE_SECRET", "s3cret");
  const response = await middleware(tunnelled("/m/monad"));
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("https://social.example/gate?next=%2Fm%2Fmonad");
});

test("behind the tunnel a page is https, so its CSP upgrades insecure requests", async () => {
  vi.stubEnv("GATE_SECRET", "");
  const response = await middleware(tunnelled("/m/monad"));
  expect(response.headers.get("content-security-policy")).toContain("upgrade-insecure-requests");
});

test("a direct http request with no forwarding headers is not treated as https", async () => {
  vi.stubEnv("GATE_SECRET", "");
  const response = await middleware(new NextRequest("http://127.0.0.1:3100/"));
  expect(response.headers.get("content-security-policy")).not.toContain("upgrade-insecure-requests");
});

// The origin becomes a Location header; anything but a bare host is ignored.
test("a Host header that is more than a host name is not trusted for the redirect", async () => {
  vi.stubEnv("GATE_SECRET", "s3cret");
  for (const host of ["social.example@evil.example", "evil.example/path", "evil.example#"]) {
    const response = await middleware(
      new NextRequest("https://social.example/m/monad", { headers: { host, "x-forwarded-proto": "https" } }),
    );
    expect(response.headers.get("location"), host).toBe("https://social.example/gate?next=%2Fm%2Fmonad");
  }
});

// A Host that looks like a host but is no valid URL authority must not take the
// page down; the request's own origin is used instead.
test("a Host that cannot form a URL falls back to the request's origin", async () => {
  vi.stubEnv("GATE_SECRET", "s3cret");
  for (const host of ["social.example:99999", "[:::]"]) {
    const response = await middleware(
      new NextRequest("https://social.example/m/monad", { headers: { host, "x-forwarded-proto": "https" } }),
    );
    expect(response.headers.get("location"), host).toBe("https://social.example/gate?next=%2Fm%2Fmonad");
  }
});

test("removed pages and APIs return 404 even when the invite gate is on", async () => {
  vi.stubEnv("GATE_SECRET", "s3cret");
  for (const path of ["/launchpad", "/launchpad/create", "/launchpad/0xabc", "/profile", "/analytics", "/terms", "/privacy", "/brand", "/api/launches", "/api/rpc", "/api/health"]) {
    const response = await middleware(request(path));
    expect(response.status, path).toBe(404);
    expect(response.headers.get("location"), path).toBeNull();
    expect(response.headers.get("content-security-policy"), path).toBeTruthy();
  }
});

test("social pages and their brand assets remain accessible", async () => {
  vi.stubEnv("GATE_SECRET", "");
  for (const path of ["/", "/m/monad", "/alice", "/p/1", "/gate", "/brand/mochi-mark-small.svg", "/brand/icons/mochi-192.png"]) {
    expect((await middleware(request(path))).status, path).toBe(200);
  }
});
