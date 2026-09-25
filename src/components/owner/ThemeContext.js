"use client";

import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext({ theme: "light", toggleTheme: () => {} });

export function ThemeProvider({ children, className = "" }) {
  // "Neural Command Deck" ships dark-first — light stays available (and still
  // wins once the owner has picked it once, restored below).
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("owner-theme");
      if (stored === "dark" || stored === "light") setTheme(stored);
    } catch {
    }
  }, []);

  const toggleTheme = () => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("owner-theme", next);
      } catch {
      }
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <div className={`owner-app${className ? ` ${className}` : ""}`} data-theme={theme}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
