"use client";

import { createContext, useContext, useState } from "react";

const ThemeContext = createContext({ theme: "dark", toggleTheme: () => {} });

const COOKIE = "owner-theme";
const ONE_YEAR = 60 * 60 * 24 * 365;

export function ThemeProvider({ children, className = "", initialTheme = "dark" }) {
  // Seeded from a cookie the server already read, so the first paint is the
  // user's own theme — a localStorage read in an effect would flash the
  // default first.
  const [theme, setTheme] = useState(initialTheme);

  const toggleTheme = () => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      document.cookie = `${COOKIE}=${next}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
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

export const OWNER_THEME_COOKIE = COOKIE;
