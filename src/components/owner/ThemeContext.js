"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { readTheme, saveTheme } from "@/lib/theme";

const ThemeContext = createContext({ theme: "light", toggleTheme: () => {} });

const COOKIE = "owner-theme";
const ONE_YEAR = 60 * 60 * 24 * 365;

const currentMode = () =>
  typeof document !== "undefined" && document.documentElement.dataset.mode === "dark" ? "dark" : "light";

/*
 * The owner panel follows the CRM-wide appearance (lib/theme: html[data-mode] / [data-accent]).
 * `data-theme` on .owner-app is kept in step for the few owner rules that still key off it,
 * and the cookie lets the server render that attribute without a flash.
 */
export function ThemeProvider({ children, className = "", initialTheme = "light" }) {
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => {
    const sync = () => {
      const mode = currentMode();
      setTheme(mode);
      document.cookie = `${COOKIE}=${mode}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
    };
    sync();
    window.addEventListener("crm-theme", sync);
    return () => window.removeEventListener("crm-theme", sync);
  }, []);

  const toggleTheme = () => saveTheme({ ...readTheme(), mode: currentMode() === "dark" ? "light" : "dark" });

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

export const OWNER_THEME_COOKIE = COOKIE;
