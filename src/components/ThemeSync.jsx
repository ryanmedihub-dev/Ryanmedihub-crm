"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { applyTheme, clearTheme, readTheme, themedPath } from "@/lib/theme";

// Keeps html[data-mode]/[data-accent] in step with client-side navigation and the OS setting.
export default function ThemeSync() {
  const pathname = usePathname();
  useEffect(() => {
    if (!themedPath(pathname)) return clearTheme();
    applyTheme();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onOs = () => readTheme().mode === "system" && applyTheme();
    mq.addEventListener("change", onOs);
    return () => mq.removeEventListener("change", onOs);
  }, [pathname]);
  return null;
}
