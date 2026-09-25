"use client";

import { useEffect, useState } from "react";
import { loadPrefs, onPrefsChange, savePrefs, subLevel, type SubLevel } from "@social/lib/notify";

const LEVELS: { value: SubLevel; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "hot", label: "Hot" },
  { value: "all", label: "All" },
];

/**
 * How much of this community to hear about, set where the community is.
 *
 * The bell lists what happened; the level for a community belongs on that
 * community's page rather than as one more row in a panel that then has to
 * scroll. Only a member sees it, because a level for a community you are not
 * in would never fire.
 */
export function CommunityNotify({ name }: { name: string }) {
  const [level, setLevel] = useState<SubLevel>("hot");

  useEffect(() => {
    setLevel(subLevel(loadPrefs(), name));
    return onPrefsChange(() => setLevel(subLevel(loadPrefs(), name)));
  }, [name]);

  function choose(next: SubLevel) {
    const prefs = loadPrefs();
    setLevel(next);
    savePrefs({ ...prefs, communities: { ...prefs.communities, [name]: next } });
  }

  return (
    <span className="sub-notify" title="Notifications for this community">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
        <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6z" strokeLinejoin="round" />
        <path d="M10.3 20a2 2 0 0 0 3.4 0" strokeLinecap="round" />
      </svg>
      <span className="seg">
        {LEVELS.map((o) => (
          <button
            key={o.value}
            className={level === o.value ? "is-on" : ""}
            aria-pressed={level === o.value}
            onClick={() => choose(o.value)}
            data-testid={`sub-notify-${o.value}`}
          >
            {o.label}
          </button>
        ))}
      </span>
    </span>
  );
}
