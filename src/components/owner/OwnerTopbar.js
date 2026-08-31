"use client";

import { useTheme } from "./ThemeContext";
import { useShell } from "./ShellContext";

export default function OwnerTopbar({ title, subtitle, controls }) {
  const { theme, toggleTheme } = useTheme();
  const { setNavOpen } = useShell();

  return (
    <div className="topbar">
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <button
          className="icon-btn menu-btn"
          type="button"
          aria-label="Open navigation"
          onClick={() => setNavOpen(true)}
        >
          ☰
        </button>
        <div style={{ minWidth: 0 }}>
          {title && <h1>{title}</h1>}
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      <div className="top-actions">
        {controls}
        <button
          className="icon-btn"
          type="button"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>
      </div>
    </div>
  );
}
