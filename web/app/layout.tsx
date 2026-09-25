import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { ChainPulse } from "@social/components/ChainPulse";
import { BRAND } from "@/lib/brand";
import { inter, instrumentSerif } from "@/lib/fonts";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
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
        {children}
        <ChainPulse />
      </body>
    </html>
  );
}
