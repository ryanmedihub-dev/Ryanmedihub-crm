"use client";

import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { useShell } from "./ShellContext";

/**
 * The /owner grid shell. Lives in the owner layout, so the sidebar mounts once
 * and survives navigation (no re-render, no scroll reset, no flash) — only the
 * `.main` column swaps.
 */
export default function OwnerShell({ children }) {
  const { navCollapsed } = useShell();

  return (
    <div className={`app${navCollapsed ? " nav-collapsed" : ""}`}>
      <OwnerSidebar />
      <div className="main">{children}</div>
    </div>
  );
}
