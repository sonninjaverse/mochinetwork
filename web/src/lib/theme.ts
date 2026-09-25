export type Theme = "light" | "dark";
const KEY = "mochi-theme";

export function readStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(KEY);
  return value === "light" || value === "dark" ? value : null;
}

export function preferredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.classList.remove("theme-pending");
  try {
    window.localStorage.setItem(KEY, theme);
  } catch {
    // Private windows reject writes. A theme that cannot be remembered is
    // still a theme that works for this visit.
  }
}

export function currentTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function toggleTheme(): Theme {
  const next: Theme =
    document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}

export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem("${KEY}");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.setAttribute("data-theme",t);}catch(e){document.documentElement.setAttribute("data-theme","light");}document.documentElement.classList.remove("theme-pending");})();`;
