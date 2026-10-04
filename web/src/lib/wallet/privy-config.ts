/**
 * Privy is an optional wallet, selected with NEXT_PUBLIC_WALLET=privy.
 *
 * External wallets connect as-is; email sign-in gets a Privy embedded wallet
 * because there is nothing else to sign with. The passkey wallet stays the
 * default so existing accounts and their RP id scope are untouched.
 */
export type WalletKind = "mera" | "burner" | "privy";

export function walletKind(): WalletKind {
  const kind = process.env.NEXT_PUBLIC_WALLET?.trim().toLowerCase();
  return kind === "burner" || kind === "privy" ? kind : "mera";
}

export function privyEnabled(): boolean {
  return walletKind() === "privy";
}

/** The Privy app id from the dashboard. Empty disables the provider. */
export function privyAppId(): string {
  return process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? "";
}

/**
 * Origins the Privy SDK and its WalletConnect connectors reach at runtime.
 *
 * Kept here rather than in the edge CSP module so the middleware and any
 * client-side note share one list. Dropping one of these makes the modal look
 * broken rather than blocked: the request fails silently inside an iframe.
 */
export const PRIVY_CONNECT_ORIGINS = [
  "https://auth.privy.io",
  "https://*.rpc.privy.systems",
  "https://explorer-api.walletconnect.com",
  "https://*.walletconnect.com",
  "https://*.walletconnect.org",
  "wss://relay.walletconnect.com",
  "wss://relay.walletconnect.org",
];

export const PRIVY_FRAME_ORIGINS = [
  "https://auth.privy.io",
  "https://verify.walletconnect.com",
  "https://verify.walletconnect.org",
  "https://secure.walletconnect.com",
  "https://secure.walletconnect.org",
];

export const PRIVY_IMAGE_ORIGINS = [
  "https://explorer-api.walletconnect.com",
  "https://*.privy.io",
];
