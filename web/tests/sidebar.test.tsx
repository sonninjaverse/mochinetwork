import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Sidebar } from "@social/components/Sidebar";

const ME = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";

const { nav } = vi.hoisted(() => ({ nav: { pathname: "/" } }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("@social/lib/viewer", () => ({ useViewer: () => ME }));

afterEach(() => {
  cleanup();
  nav.pathname = "/";
  vi.unstubAllEnvs();
});

// profilePath ends in a slash and Next drops it from the pathname, so the
// Profile item is compared the way the other items are.
test("the Profile item is current on your own profile", () => {
  nav.pathname = `/${ME}`;
  render(<Sidebar />);
  expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
});

test("the Profile item is not current elsewhere", () => {
  nav.pathname = "/popular";
  render(<Sidebar />);
  expect(screen.getByRole("link", { name: "Profile" })).not.toHaveAttribute("aria-current");
  expect(screen.getByRole("link", { name: "Popular" })).toHaveAttribute("aria-current", "page");
});

test("navigation contains only social destinations", () => {
  render(<Sidebar />);
  expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/", "/popular", "/m", `/${ME}`]);
});
