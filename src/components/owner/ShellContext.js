"use client";

import { createContext, useContext, useEffect, useState } from "react";

const COLLAPSE_KEY = "owner-sidebar-collapsed";
const LEGACY_KEY = "owner-nav-collapsed";

const ShellContext = createContext({
  navOpen: false,
  setNavOpen: () => {},
  navCollapsed: false,
  setNavCollapsed: () => {},
  toggleNavCollapsed: () => {},
  cmdBarOpen: false,
  openCommandBar: () => {},
  closeCommandBar: () => {},
  toggleCommandBar: () => {},
});

export function ShellProvider({ children }) {
  const [navOpen, setNavOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [cmdBarOpen, setCmdBarOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(COLLAPSE_KEY) ?? localStorage.getItem(LEGACY_KEY);
      if (stored === "true" || stored === "1") setNavCollapsed(true);
    } catch {
      /* private mode / blocked storage — stay expanded */
    }
  }, []);

  const updateNavCollapsed = (valOrFn) => {
    setNavCollapsed((prev) => {
      const next = typeof valOrFn === "function" ? valOrFn(prev) : valOrFn;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "true" : "false");
        localStorage.setItem(LEGACY_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const value = {
    navOpen,
    setNavOpen,
    navCollapsed,
    setNavCollapsed: updateNavCollapsed,
    toggleNavCollapsed: () => updateNavCollapsed((c) => !c),
    cmdBarOpen,
    openCommandBar: () => setCmdBarOpen(true),
    closeCommandBar: () => setCmdBarOpen(false),
    toggleCommandBar: () => setCmdBarOpen((o) => !o),
  };

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell() {
  return useContext(ShellContext);
}
