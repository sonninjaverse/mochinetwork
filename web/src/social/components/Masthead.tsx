"use client";

import Image from "next/image";
import Link from "next/link";
import { DOCS_URL } from "@social/lib/links";
import { BRAND } from "@/lib/brand";
import { BottomNav } from "./BottomNav";
import { NotificationBell } from "./NotificationBell";
import { SignInButton } from "./SignInButton";
import { ThemeToggle } from "./ThemeToggle";

/**
 * The top bar, with the same controls on every page.
 *
 * The bell and the docs link used to sit in a second row under this one,
 * alongside the tabs. When the tabs moved into the rail on a wide screen that
 * row was left holding two links at the far right and nothing else, so both
 * moved up here where the tabs no longer reach.
 *
 * Search is deliberately not here: on a phone it crowded the header, and the
 * one place it is actually used — finding a community — has its own field on
 * the directory, right where the list it filters is.
 */
export function Masthead() {
  return (
    <>
    <header className="masthead">
      <Link href="/" className="wordmark" aria-label={BRAND.name}>
        <Image src={BRAND.markSmall} alt="" width={30} height={30} priority />
        <span>
          mochi<em> network</em>
        </span>
      </Link>
      <div className="masthead-actions">
        <NotificationBell />
        <a
          className="tab tab-docs"
          href={DOCS_URL}
          target="_blank"
          rel="noreferrer"
          data-testid="docs-link"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
            <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H5.5A1.5 1.5 0 0 1 4 15.5z" strokeLinejoin="round" />
            <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h4.5a1.5 1.5 0 0 0 1.5-1.5z" strokeLinejoin="round" />
          </svg>
          <span className="tab-label">Docs</span>
        </a>
        <ThemeToggle />
        <SignInButton />
      </div>
    </header>
    <BottomNav />
    </>
  );
}
