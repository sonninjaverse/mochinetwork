import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { ChainPulse } from "@social/components/ChainPulse";
import { BRAND } from "@/lib/brand";
import { inter, instrumentSerif } from "@/lib/fonts";
import { SPLASH_ID, SPLASH_SCRIPT } from "@/lib/splash";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.url),
  // The name leads: a browser tab truncates from the right.
  title: {
    default: `${BRAND.name} — ${BRAND.tagline}`,
    template: `%s · ${BRAND.name}`,
  },
  description: BRAND.feedDescription,
  applicationName: BRAND.name,
  icons: {
    icon: [
      { url: "/brand/mochi-mark-small.svg", type: "image/svg+xml" },
      { url: "/brand/favicon.ico", sizes: "32x32" },
      { url: "/brand/icons/mochi-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/brand/mochi-apple-icon.png",
  },
  manifest: "/site.webmanifest",
  openGraph: {
    type: "website",
    url: BRAND.url,
    siteName: BRAND.name,
    title: BRAND.tagline,
    description: BRAND.feedDescription,
    images: [{ url: BRAND.feedSocialImage, width: 512, height: 512, alt: BRAND.tagline }],
  },
  twitter: {
    card: "summary_large_image",
    title: BRAND.tagline,
    description: BRAND.shortDescription,
    images: [BRAND.feedSocialImage],
  },
};

export const viewport: Viewport = {
  // A Home Screen app draws edge to edge, so the safe-area insets are ours.
  viewportFit: "cover",
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fff9f2" },
    { media: "(prefers-color-scheme: dark)", color: "#201a1e" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" className={`theme-pending ${inter.variable} ${instrumentSerif.variable}`} suppressHydrationWarning>
      <body>
        {/* Runs before paint so the page never flashes the wrong theme. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        {/* Server-rendered, so the mark is there on the first frame. The
            script below it takes it down once the document has arrived. */}
        <div id={SPLASH_ID} aria-hidden="true">
          <svg width="88" height="88" viewBox="0 0 64 64" fill="none">
            <path
              d="M7 43C7 27 16 10 29 10c5 0 8 2 10 6 1-3 3-5 6-4 8 3 12 18 12 31 0 10-11 15-25 15S7 53 7 43Z"
              fill="#F3B5C7"
              stroke="#513B42"
              strokeWidth="2.4"
              strokeLinejoin="round"
            />
            <path d="M18 24q4-6 10-7" fill="none" stroke="#FFF4EC" strokeWidth="3" strokeLinecap="round" />
            <ellipse cx="18" cy="42" rx="4" ry="2.5" fill="#DE829F" />
            <ellipse cx="46" cy="42" rx="4" ry="2.5" fill="#DE829F" />
            <g fill="#513B42">
              <ellipse cx="24" cy="36" rx="2.1" ry="3.1" />
              <ellipse cx="40" cy="36" rx="2.1" ry="3.1" />
              <path d="M28 43q4 5 8 0" fill="none" stroke="#513B42" strokeWidth="2.2" strokeLinecap="round" />
            </g>
          </svg>
        </div>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: SPLASH_SCRIPT }} />
        <Providers>{children}</Providers>
        <ChainPulse />
      </body>
    </html>
  );
}
