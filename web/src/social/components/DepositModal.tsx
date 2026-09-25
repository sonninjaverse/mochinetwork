"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { Address } from "viem";
import { monadTestnet } from "@social/lib/chain";
import { Modal } from "./Modal";

/**
 * The receive direction: this account's address, as something to copy or scan.
 *
 * A QR is the point of a deposit screen — a phone camera is how most people get
 * the address across — so the address stays selectable beside it for anyone who
 * would rather paste.
 */
export function DepositModal({ address, onClose }: { address: Address; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // A browser that refuses the clipboard still shows the address to select.
    }
  }

  return (
    <Modal title="Deposit MON" onClose={onClose}>
      <div className="wallet-qr" data-testid="deposit-qr">
        <QRCodeSVG value={address} size={168} marginSize={1} bgColor="#ffffff" fgColor="#201a1e" />
      </div>

      <p className="wallet-hint">This is your account. Send MON to it from any wallet.</p>

      <button className="wallet-address" onClick={() => void copy()} data-testid="copy-address">
        <code>{address}</code>
        <span className="wallet-copy">{copied ? "Copied" : "Copy"}</span>
      </button>

      <p className="modal-note">
        Only send MON on {monadTestnet.name}. Assets sent on another network are
        gone.
      </p>
    </Modal>
  );
}
