import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Supports a self-contained Node.js deployment.
  output: "standalone",
  // Otherwise Next picks the trace root by looking for lockfiles upwards, and a
  // stray one above web/ on some machine would move server.js down a mirrored
  // path. Next compiles this file to CommonJS, so __dirname is web/.
  outputFileTracingRoot: __dirname,
  async headers() {
    return [
      // Every response, static files included. Middleware skips /_next/static
      // and sets the full set, CSP included, on everything else; these three
      // are the ones a script, image or font needs too.
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/docs",
        destination: `${(process.env.NEXT_PUBLIC_DOCS_URL || "http://localhost:5174").replace(/\/+$/, "")}/`,
        permanent: false,
      },
      {
        source: "/docs/:path*",
        destination: `${(process.env.NEXT_PUBLIC_DOCS_URL || "http://localhost:5174").replace(/\/+$/, "")}/:path*`,
        permanent: false,
      },
      // Old names for Home and Popular, from before the renames.
      { source: "/subs", destination: "/", permanent: true },
      { source: "/all", destination: "/popular", permanent: true },
      // CloudFront's internal placeholders for a profile by address and a
      // post, which leaked into links. The routes refuse both prefixes.
      { source: "/a/:address", destination: "/:address", permanent: true },
      { source: "/u/:handle/:n", destination: "/:handle/:n", permanent: true },
    ];
  },
};

export default nextConfig;
