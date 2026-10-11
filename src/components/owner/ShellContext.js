"use client";

import { createContext, useContext, useEffect, useState } from "react";

const COLLAPSE_KEY = "owner-nav-collapsed";

const ShellContext = createContext({
  navOpen: false,
  setNavOpen: () => {},
  navCollapsed: false,
  toggleNavCollapsed: () => {},
  cmdBarOpen: false,
  openCommandBar: () => {},
  closeCommandBar: () => {},
  toggleCommandBar: () => {},
});

export function ShellProvider({ children }) {
  const [navOpen, setNavOpen] = useState(false);
  const [cmdBarOpen, setCmdBarOpen] = useState(false);

  // Starts expanded so SSR and first client render agree; the stored
  // preference is applied after hydration.
  const [navCollapsed, setNavCollapsed] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(COLLAPSE_KEY) === "1") setNavCollapsed(true);
    } catch {
      /* private mode / blocked storage — stay expanded */
    }
  }, []);

  const toggleNavCollapsed = () =>
    setNavCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });

  const value = {
    navOpen,
    setNavOpen,
    navCollapsed,
    toggleNavCollapsed,
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
