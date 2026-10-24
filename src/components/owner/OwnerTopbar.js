"use client";

import { useTheme } from "./ThemeContext";
import { useShell } from "./ShellContext";
import AiStatusBeacon from "./ai/AiStatusBeacon";
import { relativeTime } from "@/lib/ai/client/aiLabels";
import { Menu, Sun, Moon, Sparkles } from "lucide-react";

function aiStatusText(aiState) {
  if (!aiState) return null;
  if (aiState.status === "running") return "AI analyzing…";
  if (aiState.status === "ready") return `AI analyzed ${relativeTime(aiState.generatedAt)}`;
  return null;
}

export default function OwnerTopbar({ title, subtitle, controls, aiState }) {
  const { theme, toggleTheme } = useTheme();
  const { navOpen, setNavOpen, navCollapsed, toggleNavCollapsed, openCommandBar } = useShell();
  const aiText = aiStatusText(aiState);

  const handleMenuClick = () => {
    if (typeof window !== "undefined" && window.innerWidth <= 900) {
      setNavOpen((o) => !o);
    } else {
      toggleNavCollapsed();
    }
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          className="icon-btn menu-btn"
          type="button"
          aria-label={navCollapsed ? "Expand sidebar navigation" : "Collapse sidebar navigation"}
          title={navCollapsed ? "Expand sidebar navigation" : "Collapse sidebar navigation"}
          onClick={handleMenuClick}
        >
          <Menu size={18} />
        </button>
        <div className="topbar-heading topbar-titles">
          {title && <h1 className="topbar-title">{title}</h1>}
          {subtitle && <p className="topbar-subtitle">{subtitle}</p>}
          {aiText && <span className="ai-topbar-status">{aiText}</span>}
        </div>
      </div>

      <div className="top-actions">
        <AiStatusBeacon />
        <button type="button" className="ai-cmdk-btn" onClick={openCommandBar} title="Ask AI or search commands (⌘K)">
          <Sparkles size={14} className="ai-cmdk-icon" />
          <span className="ai-cmdk-text">Ask AI</span>
          <kbd>⌘K</kbd>
        </button>
        {controls}
        <button
          className="icon-btn theme-toggle-btn"
          type="button"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  );
}
