"use client";

import { createContext, useContext, useState } from "react";

const ShellContext = createContext({ navOpen: false, setNavOpen: () => {} });

export function ShellProvider({ children }) {
  const [navOpen, setNavOpen] = useState(false);
  return (
    <ShellContext.Provider value={{ navOpen, setNavOpen }}>
      {children}
    </ShellContext.Provider>
  );
}

export function useShell() {
  return useContext(ShellContext);
}
