"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * The way back.
 *
 * history.back() rather than a link home, because the page you came from is
 * almost never the home page — it is the feed you were scrolling, at the
 * position you were at, or the profile whose post you opened. A link to "/"
 * throws that away and quietly costs you your place.
 *
 * Whether there is anything to go back to can only be known in the browser, so
 * it is settled in an effect. Someone who arrived on a shared link has no
 * history here and gets Explore, which is the one page that is always worth
 * arriving at.
 */
export function BackLink() {
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => setCanGoBack(window.history.length > 1), []);

  return (
    <p className="tab-blurb">
      {canGoBack ? (
        <button className="link-button" onClick={() => window.history.back()}>
          ← Back
        </button>
      ) : (
        <Link href="/">← Explore</Link>
      )}
    </p>
  );
}
