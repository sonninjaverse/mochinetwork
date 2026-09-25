"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { joinCommunity, leaveCommunity } from "@social/lib/actions";
import { publicClient } from "@social/lib/chain";
import { toBytes32 } from "@social/lib/community";
import { CONTRACTS, communityRegistryAbi } from "@social/lib/contracts";
import { fetchCommunity } from "@social/lib/indexer";
import { explainError, isUserCancelled } from "@/lib/wallet/errors";

export function JoinButton({ viewer, name, onChanged }: {
  viewer: Address; name: string; onChanged?: () => void;
}) {
  const [joined, setJoined] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setJoined(null);
    setError(null);
    if (!CONTRACTS.communityRegistry) return;
    void publicClient.readContract({ address: CONTRACTS.communityRegistry, abi: communityRegistryAbi,
      functionName: "joinedAt", args: [toBytes32(name), viewer] })
      .then(at => { if (active) setJoined(at !== 0n); }, () => { if (active) setError("Could not read your membership."); });
    return () => { active = false; };
  }, [name, viewer, retry]);

  async function toggle() {
    if (joined === null || busy) return;
    const wanted = !joined;
    setBusy(true);
    setError(null);
    setJoined(wanted);
    try {
      await (wanted ? joinCommunity(name) : leaveCommunity(name));
    } catch (e) {
      setJoined(!wanted);
      if (!isUserCancelled(e)) setError(explainError(e));
      setBusy(false);
      return;
    }
    // The receipt confirms membership; the feed's candidates catch up separately.
    try {
      for (let i = 0; i < 20; i++) {
        if ((await fetchCommunity(name, viewer))?.joined === wanted) break;
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    } catch { /* Keep the membership confirmed by the receipt. */ }
    onChanged?.();
    setBusy(false);
  }

  if (!CONTRACTS.communityRegistry) return null;
  return <div className="follow-wrap">
    <button className={`btn btn-sm${joined ? " btn-quiet" : ""}`} disabled={busy || joined === null}
      aria-pressed={joined ?? false} data-testid="community-join" onClick={() => void toggle()}>
      {busy ? "Saving…" : joined === null ? "Checking…" : joined ? "Leave" : "Join"}
    </button>
    {error && <span className="follow-error" role="alert">{error} {joined === null &&
      <button className="btn btn-quiet btn-sm" onClick={() => setRetry(n => n + 1)}>Retry</button>}</span>}
  </div>;
}
