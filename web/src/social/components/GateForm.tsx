"use client";

import { useEffect, useState } from "react";

const BASE = process.env.NEXT_PUBLIC_INDEXER_URL;

/**
 * The private gate's only page.
 *
 * A native form post, deliberately not a fetch: the API answers on another
 * origin, and a top-level form submission accepts its Set-Cookie without the
 * CORS credentials dance a fetch would need. The API then answers 303, turning
 * the POST into a plain navigation to wherever the reader was headed.
 */
export function GateForm() {
  const [bad, setBad] = useState(false);
  const [next, setNext] = useState("/");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setBad(params.get("bad") === "1");
    const target = params.get("next") ?? "/";
    // Only a path on this site. The API refuses the rest anyway; this keeps a
    // crafted link from even being posted.
    setNext(target === "/" || /^\/[^/\\]/.test(target) ? target : "/");
  }, []);

  return (
    <form className="gate-card" method="post" action={BASE ? `${BASE}/gate` : "#"}>
      {/* The mark, not the wordmark: it reads on both themes without a second
          asset and without knowing which theme is on. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="gate-mark" src="/brand/mochi-mark.svg" alt="" width={60} height={60} />

      <h1>Private beta</h1>
      <p className="gate-lead">
        Mochi is invite-only for now. Enter your code to step inside.
      </p>

      <input type="hidden" name="next" value={next} />
      <label className="gate-field">
        <span>Invite code</span>
        <input
          name="code"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          required
          disabled={!BASE}
          placeholder="mochi-…"
          data-testid="gate-code"
        />
      </label>

      {(bad || !BASE) && (
        <p className="gate-error" role="alert">
          {BASE ? "That code was not accepted. Check it and try again." : "This build has no API URL configured."}
        </p>
      )}

      <button className="btn gate-submit" type="submit" disabled={!BASE} data-testid="gate-submit">
        Continue
      </button>
    </form>
  );
}
