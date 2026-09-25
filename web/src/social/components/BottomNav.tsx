"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { profilePath } from "@social/lib/permalink";
import { useViewer } from "@social/lib/viewer";

/**
 * The phone's navigation: a bar at the bottom, where a thumb already is.
 *
 * The rail on a wide screen does this job there; on a phone it is hidden and
 * the destinations move down here rather than back into the header, which is
 * the pattern every phone app uses for a reason.
 */
const ITEMS = [
  {
    href: "/",
    label: "Home",
    d: "M3 10.7 12 3l9 7.7M5.5 9.5V21h13V9.5",
  },
  {
    href: "/popular/",
    label: "Popular",
    d: "M12 3c1 4-3 5-3 9a3 3 0 0 0 6 0c0-1.5-.7-2.4-1.5-3.5C15 11 17 12.5 17 15a5 5 0 0 1-10 0c0-4 3-6 5-12z",
  },
  {
    href: "/m/",
    label: "Communities",
    d: "M4 5.5h6v6H4zM14 5.5h6v6h-6zM4 14.5h6v6H4zM14 14.5h6v6h-6z",
  },
] as const;

/** Shown only once there is an account to open: a Profile tab with no profile
    is a dead end, and the header already offers sign-in. */
const PROFILE = {
  label: "Profile",
  d: "M12 11.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20a7 7 0 0 1 14 0",
};

export function BottomNav() {
  const path = usePathname();
  const viewer = useViewer();

  const items = viewer
    ? [...ITEMS, { href: profilePath({ address: viewer }), label: PROFILE.label, d: PROFILE.d }]
    : ITEMS;

  return (
    <nav className="bottom-nav">
      {items.map(({ href, label, d }) => {
        const active = path === href || `${path}/` === href;
        return (
          <Link
            key={href}
            href={href}
            className="bottom-nav-item"
            aria-current={active ? "page" : undefined}
          >
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
              <path d={d} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
