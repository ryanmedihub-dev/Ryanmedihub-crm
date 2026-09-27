"use client";

import { useTheme } from "./ThemeContext";
import { useShell } from "./ShellContext";
import AiStatusBeacon from "./ai/AiStatusBeacon";
import { relativeTime } from "@/lib/ai/client/aiLabels";

function aiStatusText(aiState) {
  if (!aiState) return null;
  if (aiState.status === "running") return "AI analyzing…";
  if (aiState.status === "ready") return `AI analyzed ${relativeTime(aiState.generatedAt)}`;
  return null;
}

export default function OwnerTopbar({ title, subtitle, controls, aiState }) {
  const { theme, toggleTheme } = useTheme();
  const { setNavOpen, openCommandBar } = useShell();
  const aiText = aiStatusText(aiState);

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
          {aiText && <span className="ai-topbar-status">{aiText}</span>}
        </div>
      </div>
      <div className="top-actions">
        <AiStatusBeacon />
        <button type="button" className="ai-cmdk-btn" onClick={openCommandBar}>
          <kbd>⌘K</kbd> Ask AI
        </button>
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
