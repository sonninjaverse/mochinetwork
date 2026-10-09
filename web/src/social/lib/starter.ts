import { apiFetch } from "./api";

const INDEXER = process.env.NEXT_PUBLIC_INDEXER_URL;

/// Fired when starter MON has landed, so the profile can stop showing zero.
export const STARTER_EVENT = "mochi:starter";

/**
 * Asks the indexer for a one-time starter drip on a new address.
 *
 * A wallet made here starts with nothing, and the first thing it wants to do
 * — claim from the faucet — is a transaction that costs gas. The drip is a
 * courtesy, not a step: callers fire it and move on, and a refusal (already
 * dripped, float empty, offline) changes nothing about signing up.
 */
export async function requestStarterMon(address: string): Promise<void> {
  const res = await apiFetch(`${INDEXER}/drip`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address }),
  });
  const payload = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new Error(payload?.error ?? "Could not send starter MON.");
}
