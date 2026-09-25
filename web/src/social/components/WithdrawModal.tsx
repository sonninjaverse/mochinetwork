"use client";

import { useEffect, useState } from "react";
import { formatEther, type Address, type Hash } from "viem";
import { monadTestnet, publicClient } from "@social/lib/chain";
import { getWallet } from "@/lib/wallet";
import { explainError, isUserCancelled } from "@/lib/wallet/errors";
import {
  maxSendable,
  WITHDRAW_MESSAGE,
  withdrawError,
  withdrawValue,
} from "@/lib/wallet/transfer";
import { Modal } from "./Modal";

function formatMon(wei: bigint): string {
  const exact = Number(formatEther(wei));
  if (exact === 0) return "0";
  return exact.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

/**
 * The send direction: a recipient, an amount, and the wallet's own signature.
 *
 * The only rule the modal enforces is the one `withdrawError` states, so the
 * message beside the button and the check before the send cannot disagree.
 */
export function WithdrawModal({
  address,
  balance,
  onClose,
  onSent,
}: {
  address: Address;
  balance: bigint | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [gasPrice, setGasPrice] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [hash, setHash] = useState<Hash | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Read once, for the Max button and the gas reserve. A transfer is 21000 gas,
  // so the price is all that is missing.
  useEffect(() => {
    void publicClient.getGasPrice().then(setGasPrice, () => setGasPrice(null));
  }, []);

  const held = balance ?? 0n;
  const most = maxSendable(held, gasPrice);
  const problem =
    balance === null
      ? "no-gas"
      : withdrawError({ to, amount, self: address, balance: held, gasPrice });

  function useMax() {
    if (most !== null) setAmount(formatEther(most));
  }

  async function send() {
    if (problem) return;
    setBusy(true);
    setError(null);
    try {
      const sent = await getWallet().send({
        to: to.trim() as Address,
        value: withdrawValue(amount),
      });
      setHash(sent);
      onSent();
    } catch (e) {
      if (!isUserCancelled(e)) setError(explainError(e));
    } finally {
      setBusy(false);
    }
  }

  if (hash) {
    return (
      <Modal title="Sent" onClose={onClose}>
        <p className="modal-lead">The transfer is on its way.</p>
        <a
          className="wallet-tx"
          href={`${monadTestnet.blockExplorers?.default.url}/tx/${hash}`}
          target="_blank"
          rel="noreferrer"
        >
          {hash}
        </a>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Withdraw MON" onClose={onClose} dismissable={!busy}>
      <label className="wallet-field">
        <span>To</span>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="0x…"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          data-testid="withdraw-to"
        />
      </label>

      <label className="wallet-field">
        <span>Amount (MON)</span>
        <span className="wallet-amount">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            inputMode="decimal"
            autoComplete="off"
            data-testid="withdraw-amount"
          />
          <button
            type="button"
            className="wallet-max"
            onClick={useMax}
            disabled={most === null || most === 0n}
          >
            Max
          </button>
        </span>
      </label>

      <p className="wallet-balance">
        Balance {balance === null ? "…" : `${formatMon(held)} MON`}
      </p>

      {problem && (to || amount) && (
        <p className="modal-note is-error">{WITHDRAW_MESSAGE[problem]}</p>
      )}
      {error && <p className="modal-note is-error">{error}</p>}

      <div className="modal-actions">
        {!busy && (
          <button className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
        )}
        <button
          className="btn"
          onClick={() => void send()}
          disabled={busy || problem !== null}
          data-testid="withdraw-send"
        >
          {busy ? "Sending…" : "Send"}
        </button>
      </div>
    </Modal>
  );
}
