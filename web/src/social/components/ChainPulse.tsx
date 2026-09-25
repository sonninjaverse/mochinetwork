"use client";

import { useEffect, useState } from "react";
import { publicClient, wsClient } from "@social/lib/chain";

export function ChainPulse() {
  const [block, setBlock] = useState<bigint | null>(null);
  const [lit, setLit] = useState(false);

  useEffect(() => {
    const client = wsClient ?? publicClient;
    return client.watchBlockNumber({
      onBlockNumber: (n) => {
        setBlock(n);
        setLit(true);
        // Shorter than the block time, so the dot goes dark before the next
        // block lands and the pulse reads as a beat rather than a blur.
        setTimeout(() => setLit(false), 120);
      },
      emitOnBegin: true,
      pollingInterval: 300,
    });
  }, []);

  if (block === null) return null;

  return (
    <div className="pulse">
      <span className={`pulse-dot${lit ? " is-lit" : ""}`} />
      <span className="pulse-block">#{block.toString()}</span>
      <span className="pulse-net">Monad testnet</span>
    </div>
  );
}
