"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { profilePath } from "@social/lib/permalink";
import { useViewer } from "@social/lib/viewer";
import { InviteButton } from "./InviteButton";

/**
 * Reddit's left rail. On a phone the same list is the bottom bar.
 *
 * It used to list your communities underneath; those moved into the
 * Communities page as its first tab, so the rail is destinations only.
 */
const NAV = [
  { href: "/", label: "Home" },
  { href: "/popular/", label: "Popular" },
  { href: "/m/", label: "Communities" },
] as const;

export function Sidebar() {
  const viewer = useViewer();
  const path = usePathname();
  const mineHref = viewer ? profilePath({ address: viewer }) : null;

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        {NAV.map(({ href, label }) => {
          const active = path === href || `${path}/` === href;
          return (
            <Link
              key={href}
              href={href}
              className="sidebar-link"
              aria-current={active ? "page" : undefined}
            >
              {label}
            </Link>
          );
        })}
        {mineHref && (
          <Link
            href={mineHref}
            className="sidebar-link"
            aria-current={path === mineHref || `${path}/` === mineHref ? "page" : undefined}
          >
            Profile
          </Link>
        )}
        <InviteButton sidebar />
      </nav>
    </aside>
  );
}
