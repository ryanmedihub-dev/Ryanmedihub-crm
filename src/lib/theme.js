"use client";

import { useEffect, useState } from "react";

/*
 * Per-browser appearance: mode (light | dark | system) and accent (emerald | blue | violet).
 * Applied as html[data-mode] / html[data-accent]; globals.css maps those to tokens.
 * The landing page ("/") and the owner panel have their own visual worlds and stay untouched.
 */
export const THEME_KEY = "crm-theme";
export const DEFAULT_THEME = { mode: "light", accent: "emerald" };
export const ACCENTS = [
  { id: "emerald", label: "Emerald", swatch: "#059669" },
  { id: "blue", label: "Blue", swatch: "#2563eb" },
  { id: "violet", label: "Violet", swatch: "#7c3aed" },
];

export const themedPath = (p = "") => p !== "/" && !p.startsWith("/owner");

export function readTheme() {
  try {
    return { ...DEFAULT_THEME, ...JSON.parse(localStorage.getItem(THEME_KEY) || "{}") };
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(t = readTheme()) {
  const el = document.documentElement;
  const dark = t.mode === "dark" || (t.mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  if (dark) el.dataset.mode = "dark";
  else delete el.dataset.mode;
  if (t.accent && t.accent !== "emerald") el.dataset.accent = t.accent;
  else delete el.dataset.accent;
  window.dispatchEvent(new Event("crm-theme"));
}

export function clearTheme() {
  const el = document.documentElement;
  delete el.dataset.mode;
  delete el.dataset.accent;
  window.dispatchEvent(new Event("crm-theme"));
}

export function saveTheme(t) {
  try {
    localStorage.setItem(THEME_KEY, JSON.stringify(t));
  } catch {}
  applyTheme(t);
}

const readChart = () => {
  if (typeof window === "undefined") return { in: "#047857", out: "#d97706" };
  const cs = getComputedStyle(document.documentElement);
  return {
    in: cs.getPropertyValue("--chart-in").trim() || "#047857",
    out: cs.getPropertyValue("--chart-out").trim() || "#d97706",
  };
};

// Chart series colours follow the accent. recharts takes plain colour strings, so read the tokens.
export function useChartColors() {
  const [c, setC] = useState({ in: "#047857", out: "#d97706" });
  useEffect(() => {
    const update = () => setC(readChart());
    update();
    window.addEventListener("crm-theme", update);
    return () => window.removeEventListener("crm-theme", update);
  }, []);
  return c;
}
