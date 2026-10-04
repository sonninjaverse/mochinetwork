"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { privyEnabled } from "@/lib/wallet/privy-config";

/**
 * Loads the Privy provider only when NEXT_PUBLIC_WALLET=privy.
 *
 * The import is dynamic on purpose: a static one would put the whole Privy
 * SDK in the shared bundle for every visitor, including the passkey and
 * burner builds that never open it.
 */
const PrivyProviders = dynamic(() =>
  import("./privy-providers").then((mod) => mod.PrivyProviders),
);

export function Providers({ children }: { children: ReactNode }) {
  if (!privyEnabled()) return <>{children}</>;
  return <PrivyProviders>{children}</PrivyProviders>;
}
