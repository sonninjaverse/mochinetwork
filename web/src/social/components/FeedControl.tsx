"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { listAlgorithms, type AlgorithmInfo } from "@social/lib/algorithms";
import { publicClient } from "@social/lib/chain";
import { algorithmRegistryAbi, CONTRACTS } from "@social/lib/contracts";
import { ALGORITHM_SOURCES } from "@social/lib/generated/sources";
import { getWallet } from "@/lib/wallet";

/**
 * The feed sorts, which are Reddit's.
 *
 * Reddit ships four and no more, and it is the model this borrows from
 * outright: Hot, New, Best and Controversial are implemented from Reddit's own
 * _sorts.pyx, unchanged. Everything else that is registered stays on chain and
 * reachable by address — the point was never a long menu, it was that the
 * ranking is a contract you can replace.
 */
const FEED_SORTS = ["Hot", "Chrono", "Best", "Controversial"];

/**
 * Reddit's word for the contract's, where they differ.
 *
 * The contract calls itself Chrono; a reader has no reason to learn that word
 * when "New" is the one every feed already uses. The contract's own name is
 * what `See the contract` shows, so nothing is hidden by relabelling here.
 */
const LABELS: Record<string, string> = { Chrono: "New" };

const labelOf = (a: AlgorithmInfo) => LABELS[a.name] ?? a.name;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/**
 * One button, not six controls.
 *
 * Everything here was previously stacked above the feed: two dropdowns, a
 * source toggle, a default button, an address field and four lines of
 * explanation, all before the first post. That is a debug panel, not a product.
 *
 * The control people want by default is none. The control that makes this
 * product what it is should be one click away and, once opened, allowed to be
 * as detailed as it likes — because at that point they asked.
 */
export function FeedControl({
  slot,
  selected,
  onSelect,
  viewer,
  onRefresh,
}: {
  slot: number;
  selected: Address | null;
  onSelect: (address: Address) => void;
  viewer: Address | null;
  onRefresh: () => void;
}) {
  const [algos, setAlgos] = useState<AlgorithmInfo[]>([]);
  const [algoError, setAlgoError] = useState(false);
  const [slotDefault, setSlotDefault] = useState<Address | null>(null);

  const [open, setOpen] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [custom, setCustom] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    void listAlgorithms()
      .then((list) => live && setAlgos(list))
      .catch(() => live && setAlgoError(true));
    return () => {
      live = false;
    };
  }, []);

  // Which algorithm this slot is set to when nothing has been picked by hand.
  // A view call, so it works signed out: the zero address gets the defaults.
  useEffect(() => {
    let live = true;
    void publicClient
      .readContract({
        address: CONTRACTS.algorithmRegistry,
        abi: algorithmRegistryAbi,
        functionName: "algorithmOf",
        args: [viewer ?? ZERO_ADDRESS, slot],
      })
      .then((a) => live && setSlotDefault(a as Address))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [viewer, slot]);

  /** Retries rather than leaving the panel a dead end. */
  function retryAlgorithms() {
    setAlgoError(false);
    void listAlgorithms()
      .then(setAlgos)
      .catch(() => setAlgoError(true));
  }

  // Falling back to algos[0] made Explore label itself "Hot" while the feed it
  // showed was ranked by Discovery — the registry's first entry is not the
  // slot's default. Ask the registry which one this slot is actually using.
  const current =
    algos.find((a) => a.address === selected) ??
    algos.find((a) => a.address === slotDefault) ??
    algos[0];

  // Ordered by the list, not by the registry: registration order put New last,
  // where Reddit has always had it second.
  const wanted = FEED_SORTS;
  const sorts = [
    ...wanted
      .map((name) => algos.find((a) => a.name === name))
      .filter((a): a is AlgorithmInfo => Boolean(a)),
    // A pasted algorithm is shown alongside them rather than swallowed.
    ...algos.filter((a) => a.address === current?.address && !wanted.includes(a.name)),
  ];
  const source = current ? ALGORITHM_SOURCES[`${current.name}Feed`] : undefined;

  async function makeDefault() {
    if (!current) return;
    setSaving(true);
    try {
      await getWallet().write({
        address: CONTRACTS.algorithmRegistry,
        abi: algorithmRegistryAbi,
        functionName: "setMyAlgorithm",
        args: [slot, BigInt(current.id)],
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`control${open ? " is-open" : ""}`}>
      <button
        className="control-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="feed-control"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" />
        </svg>
        <span className="control-name">{current?.name ?? "Feed"}</span>
        <svg
          className="control-chevron"
          width="11"
          height="11"
          viewBox="0 0 12 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M1 1l5 5 5-5" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="control-panel">
          <section className="control-section">
            <h3>Ranked by</h3>

            {/* An empty list would read as "there is nothing to choose from",
                which is the opposite of the point. Say which it is. */}
            {algos.length === 0 && !algoError && (
              <p className="algo-status">Reading the registry…</p>
            )}
            {algoError && (
              <p className="algo-status">
                Could not reach the chain.{" "}
                <button className="link-button" onClick={retryAlgorithms}>
                  Try again
                </button>
              </p>
            )}

            {sorts.length > 0 && (
              <div className="algo-list">
                {sorts.map((a) => (
                  <button
                    key={a.address}
                    className={`algo${a.address === current?.address ? " is-on" : ""}`}
                    onClick={() => onSelect(a.address)}
                    data-testid={`algorithm-${a.name}`}
                  >
                    {labelOf(a)}
                  </button>
                ))}
              </div>
            )}

          </section>


          <section className="control-section">
            <div className="control-actions">
              <button
                className="btn btn-quiet btn-sm"
                onClick={() => setShowSource((v) => !v)}
                data-testid="view-source"
              >
                {showSource ? "Hide the contract" : "See the contract"}
              </button>
              {viewer && (
                <button className="btn btn-quiet btn-sm" onClick={makeDefault} disabled={saving}>
                  {saving ? "Saving…" : "Make this my default"}
                </button>
              )}
            </div>

            {showSource && source && <pre className="source">{source}</pre>}
            {showSource && !source && (
              <p className="source-missing">
                Not bundled. Read it on the explorer: <code>{current?.address}</code>
              </p>
            )}
          </section>

          <details className="control-advanced">
            <summary>Use someone else&rsquo;s algorithm</summary>
            <div className="picker-custom">
              <input
                className="field"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="0x… any deployed contract"
              />
              <button
                className="btn btn-quiet btn-sm"
                onClick={() => custom.startsWith("0x") && onSelect(custom as Address)}
              >
                Use
              </button>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
