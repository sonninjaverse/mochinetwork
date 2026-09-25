import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { BottomNav } from "@social/components/BottomNav";

const { nav } = vi.hoisted(() => ({ nav: { pathname: "/" } }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("@social/lib/viewer", () => ({ useViewer: () => undefined }));

afterEach(() => {
  cleanup();
  nav.pathname = "/";
  vi.unstubAllEnvs();
});

test("the current item carries aria-current", () => {
  nav.pathname = "/popular";
  render(<BottomNav />);
  expect(screen.getByRole("link", { name: "Popular" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
});

test("navigation contains only social destinations", () => {
  render(<BottomNav />);
  expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/", "/popular", "/m"]);
});
