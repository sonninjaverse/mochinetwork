"use client";

import { useEffect, useState } from "react";
import { currentTheme, toggleTheme, type Theme } from "@/lib/theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  // The boot script has already set the attribute; read it rather than guess.
  useEffect(() => setTheme(currentTheme()), []);

  return (
    <button
      className="icon-btn"
      onClick={() => setTheme(toggleTheme())}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      title={theme === "dark" ? "Light" : "Dark"}
    >
      {theme === "dark" ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
