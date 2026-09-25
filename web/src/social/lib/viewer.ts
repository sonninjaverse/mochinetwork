"use client";
import { useEffect, useState } from "react";
import type { Address } from "viem";
import { getWallet } from "@/lib/wallet";

export function useViewer() {
  const [viewer, setViewer] = useState<Address | null>(null);
  useEffect(() => {
    const wallet = getWallet();
    setViewer(wallet.rememberedAddress());
    return wallet.onLockChange(() => setViewer(getWallet().rememberedAddress()));
  }, []);
  return viewer;
}
