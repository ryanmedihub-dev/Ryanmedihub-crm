"use client";

import { createContext, useContext, useState } from "react";

const ShellContext = createContext({
  navOpen: false,
  setNavOpen: () => {},
  cmdBarOpen: false,
  openCommandBar: () => {},
  closeCommandBar: () => {},
  toggleCommandBar: () => {},
});

export function ShellProvider({ children }) {
  const [navOpen, setNavOpen] = useState(false);
  // AiCommandBar (⌘K palette) reads/writes this instead of owning its own
  // open state, so OwnerTopbar's "⌘K Ask AI" button can open it too.
  const [cmdBarOpen, setCmdBarOpen] = useState(false);

  const value = {
    navOpen, setNavOpen,
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
