import { NextResponse, type NextRequest } from "next/server";
import { GATE_COOKIE, gateAllows, gateExempt, isFilePath } from "@/lib/edge/gate";
import { buildCsp, SECURITY_HEADERS } from "@/lib/edge/headers";
import { RETIRED_ROUTES } from "@/lib/routes";

// A bare host name or IP literal with an optional port, nothing else: the
// origin below becomes a redirect's Location.
const HOST = /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(:\d{1,5})?$/i;

/**
 * The origin the visitor asked for. On the VPS the app answers plain http on
 * 127.0.0.1:3100 behind the Cloudflare tunnel, which passes the visitor's host
 * in Host and their scheme in X-Forwarded-Proto; request.nextUrl names only
 * the socket the server listens on. Without both headers, e.g. `next dev` or a
 * curl on the box, nextUrl is the truth.
 */
function publicOrigin(request: NextRequest): URL {
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const host = request.headers.get("host")?.trim();
  if ((proto === "https" || proto === "http") && host && HOST.test(host)) {
    try {
      return new URL(`${proto}://${host}`);
    } catch {
      // Shaped like a host but not one, e.g. port 99999 or [:::].
    }
  }
  return new URL(request.nextUrl.origin);
}

function withSecurityHeaders(response: NextResponse, csp: string): NextResponse {
  response.headers.set("Content-Security-Policy", csp);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value);
  return response;
}

function notFound(): NextResponse {
  return new NextResponse("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const origin = publicOrigin(request);

  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp({
    nonce,
    secure: origin.protocol === "https:",
    dev: process.env.NODE_ENV === "development",
    connect: [
      process.env.NEXT_PUBLIC_INDEXER_URL,
      process.env.NEXT_PUBLIC_MONAD_RPC_HTTP,
      process.env.NEXT_PUBLIC_MONAD_RPC_WS,
      // CommunityHeader and CommunityAbout fetch() their metadata from it.
      process.env.NEXT_PUBLIC_IPFS_GATEWAY,
    ],
    images: [process.env.NEXT_PUBLIC_IPFS_GATEWAY],
    // The invite gate posts a plain form to the indexer.
    forms: [process.env.NEXT_PUBLIC_INDEXER_URL],
  });

  const firstSegment = pathname.split("/")[1];
  if (RETIRED_ROUTES.has(firstSegment) && !(firstSegment === "brand" && isFilePath(pathname))) {
    return withSecurityHeaders(notFound(), csp);
  }

  // Off when GATE_SECRET is unset, which unit tests and the local stack rely on.
  const secret = process.env.GATE_SECRET?.trim();
  if (secret && !gateExempt(pathname)) {
    const open = await gateAllows(request.cookies.get(GATE_COOKIE)?.value, secret);
    if (!open) {
      // A fetch that expects JSON must not be handed the gate page.
      if (pathname.startsWith("/api/")) {
        return withSecurityHeaders(NextResponse.json({ error: "Private beta" }, { status: 401 }), csp);
      }
      const gate = new URL("/gate", origin);
      gate.search = `?next=${encodeURIComponent(pathname)}`;
      return withSecurityHeaders(NextResponse.redirect(gate, 302), csp);
    }
  }

  // Next reads the nonce off the request's CSP and stamps it on its own
  // scripts; the layout reads x-nonce for the theme boot script.
  const forwarded = new Headers(request.headers);
  forwarded.set("x-nonce", nonce);
  forwarded.set("Content-Security-Policy", csp);
  return withSecurityHeaders(NextResponse.next({ request: { headers: forwarded } }), csp);
}

export const config = {
  // Build output and the favicon are never gated and carry no page headers.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
