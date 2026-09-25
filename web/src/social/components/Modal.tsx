"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * A dialog that behaves like one.
 *
 * Escape closes it, a click on the backdrop closes it, the page behind stops
 * scrolling, and focus moves inside and stays there — Tab off the last control
 * returns to the first rather than wandering into a page nobody can see.
 *
 * `dismissable` goes false while something irreversible is running. Closing
 * halfway through creating an account would leave a passkey with no name and
 * no obvious way back.
 *
 * Rendered into document.body rather than where it is written. The masthead
 * carries a backdrop-filter, and that makes it the containing block for any
 * fixed-position descendant — the backdrop was sized to the header instead of
 * the viewport, so most of the screen behind it was still live.
 */
export function Modal({
  title,
  onClose,
  dismissable = true,
  variant = "dialog",
  children,
}: {
  /** Omitted by a palette, whose input is its own header. */
  title?: string;
  onClose: () => void;
  dismissable?: boolean;
  /** "palette" drops the title bar and the inner padding, and sits higher. */
  variant?: "dialog" | "palette";
  children: React.ReactNode;
}) {
  const card = useRef<HTMLDivElement | null>(null);
  // A portal has nowhere to go until the document exists, and server rendering
  // renders this on a machine with no document at all.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // The field, not whatever comes first in the DOM — which is the close
    // button, sitting in the header above it. Someone who opened this to type
    // should be able to type.
    const field = card.current?.querySelector<HTMLElement>("input:not([disabled])");
    (field ?? card.current?.querySelector<HTMLElement>("button:not([disabled])"))?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && dismissable) return onClose();
      if (e.key !== "Tab") return;

      const focusable = card.current?.querySelectorAll<HTMLElement>(
        "input:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])",
      );
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
    // `mounted` is a dependency because the card does not exist until the
    // portal has somewhere to go: focusing on the first pass focuses nothing.
  }, [dismissable, onClose, mounted]);

  if (!mounted) return null;

  return createPortal(
    <div
      className={`modal-backdrop${variant === "palette" ? " is-palette" : ""}`}
      onMouseDown={(e) => e.target === e.currentTarget && dismissable && onClose()}
      data-testid="modal"
    >
      <div
        className={`modal${variant === "palette" ? " is-palette" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? "Search"}
        ref={card}
      >
        {title && (
          <div className="modal-head">
            <h2>{title}</h2>
            {dismissable && (
              <button className="modal-close" onClick={onClose} aria-label="Close">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
