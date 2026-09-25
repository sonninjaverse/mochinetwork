/** Security headers and a per-request nonce CSP for the social app. */
export type CspInput = {
  nonce: string;
  /** Only an https page may ask the browser to upgrade its requests. */
  secure: boolean;
  /** next dev evaluates code for fast refresh; production never does. */
  dev: boolean;
  connect: (string | undefined)[];
  images: (string | undefined)[];
  /** Origins a plain HTML form may post to, e.g. the invite gate's indexer. */
  forms: (string | undefined)[];
};

function origins(urls: (string | undefined)[]): string[] {
  const out = new Set<string>();
  for (const url of urls) {
    if (!url) continue;
    try {
      out.add(new URL(url).origin);
    } catch {
      // A malformed variable adds nothing rather than widening the policy.
    }
  }
  return [...out];
}

export function buildCsp({ nonce, secure, dev, connect, images, forms }: CspInput): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    // React sets style attributes; the social CSP allowed the same.
    "style-src 'self' 'unsafe-inline'",
    ["img-src 'self' data: blob:", ...origins(images)].join(" "),
    "font-src 'self'",
    ["connect-src 'self'", ...origins(connect)].join(" "),
    "manifest-src 'self'",
    "worker-src 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    ["form-action 'self'", ...origins(forms)].join(" "),
  ];
  if (secure) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

export const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy":
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), publickey-credentials-get=(self), publickey-credentials-create=(self)",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Permitted-Cross-Domain-Policies": "none",
};
