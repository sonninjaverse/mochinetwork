// @vitest-environment node
import { expect, test } from "vitest";
import { buildCsp, SECURITY_HEADERS } from "@/lib/edge/headers";

const base = {
  nonce: "abc123",
  secure: true,
  dev: false,
  connect: ["https://api.social.example/", "https://testnet-rpc.monad.xyz", undefined, "wss://ws.example/x"],
  images: ["https://gateway.pinata.cloud/ipfs/"],
  forms: [] as (string | undefined)[],
};

test("scripts run only by nonce, never inline", () => {
  const csp = buildCsp(base);
  expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  expect(csp).toContain("script-src-attr 'none'");
});

test("data may come only from the indexer, the RPCs and the page itself", () => {
  expect(buildCsp(base)).toContain(
    "connect-src 'self' https://api.social.example https://testnet-rpc.monad.xyz wss://ws.example",
  );
});

test("images may come from the IPFS gateway", () => {
  expect(buildCsp(base)).toContain("img-src 'self' data: blob: https://gateway.pinata.cloud");
});

test("the page cannot be framed, and plugins and base tags are off", () => {
  const csp = buildCsp(base);
  for (const directive of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'none'"]) {
    expect(csp).toContain(directive);
  }
});

test("forms post only to the page itself when no other origin is given", () => {
  expect(buildCsp(base)).toMatch(/form-action 'self'(;|$)/);
});

// The invite gate is a plain HTML form that posts to the indexer.
test("forms may also post to the listed origins", () => {
  expect(buildCsp({ ...base, forms: ["https://api.social.example/"] })).toMatch(
    /form-action 'self' https:\/\/api\.social\.example(;|$)/,
  );
});

test("a malformed or missing form origin adds nothing", () => {
  expect(buildCsp({ ...base, forms: [undefined, "not a url", ""] })).toMatch(/form-action 'self'(;|$)/);
});

test("insecure requests are upgraded only over https, and eval only in dev", () => {
  expect(buildCsp(base)).toContain("upgrade-insecure-requests");
  expect(buildCsp({ ...base, secure: false })).not.toContain("upgrade-insecure-requests");
  expect(buildCsp({ ...base, dev: true })).toContain("'unsafe-eval'");
  expect(buildCsp(base)).not.toContain("'unsafe-eval'");
});

// Without these two a passkey cannot be created or used: the whole wallet.
test("passkeys stay allowed", () => {
  expect(SECURITY_HEADERS["Permissions-Policy"]).toContain("publickey-credentials-get=(self)");
  expect(SECURITY_HEADERS["Permissions-Policy"]).toContain("publickey-credentials-create=(self)");
});

test("transport and sniffing headers match what CloudFront sent", () => {
  expect(SECURITY_HEADERS).toMatchObject({
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-Permitted-Cross-Domain-Policies": "none",
  });
});
