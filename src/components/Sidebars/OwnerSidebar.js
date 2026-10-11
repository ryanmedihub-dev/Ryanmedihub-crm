"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { m, AnimatePresence } from "framer-motion";
import LogoutButton from "../LogoutButton";
import { useShell } from "@/components/owner/ShellContext";
import AiOrb from "@/components/owner/ai/AiOrb";
import { useAiHealthBeacon } from "@/lib/ai/client/useAiHealthBeacon";
import { OWNER_SECTIONS as SECTIONS, sectionFor } from "@/lib/owner/navTree";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

const OPEN_KEY = "owner-nav-open-group";

export default function OwnerSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { navOpen, setNavOpen, openCommandBar, navCollapsed, toggleNavCollapsed } = useShell();
  const healthBeacon = useAiHealthBeacon();
  const aiHealthActive = pathname === "/owner/ai/health";

  const inTrail = (href) => pathname === href || pathname.startsWith(href + "/");
  const activeSection = sectionFor(pathname);

  const [openGroup, setOpenGroup] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  
  useEffect(() => {
    try {
      const stored = localStorage.getItem(OPEN_KEY);
      if (stored) setOpenGroup(stored);
    } catch {
      
    }
    setHydrated(true);
  }, []);

  
  useEffect(() => {
    if (activeSection?.items && activeSection.title !== openGroup) {
      setOpenGroup(activeSection.title);
    }
  }, [activeSection]);

  
  useEffect(() => {
    if (!hydrated) return;
    try {
      if (openGroup) {
        localStorage.setItem(OPEN_KEY, openGroup);
      } else {
        localStorage.removeItem(OPEN_KEY);
      }
    } catch {
      
    }
  }, [openGroup, hydrated]);

  
  useEffect(() => {
    setNavOpen(false);
  }, [pathname, setNavOpen]);

  
  const toggle = (title) => {
    setOpenGroup((prev) => (prev === title ? null : title));
  };

  const userName = session?.user?.name || session?.user?.email || "Owner";
  const initials = userName.slice(0, 2).toUpperCase();

  return (
    <>
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}

      <aside className={`sidebar${navOpen ? " open" : ""}`}>
        <div className="brand">
          <AiOrb state="idle" size={40} />
          <div className="brand-text">
            <strong>RyanCRM</strong>
            <small>Neural Command</small>
          </div>
          <button
            type="button"
            className="icon-btn nav-collapse-btn"
            onClick={toggleNavCollapsed}
            aria-label={navCollapsed ? "Expand navigation" : "Collapse navigation"}
            title={navCollapsed ? "Expand navigation" : "Collapse navigation"}
          >
            {navCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        <nav>
          {SECTIONS.map((section, sectionIndex) => {
            const sectionActive = activeSection?.title === section.title;
            // On the collapsed rail there is no room for sub-items; the section
            // link goes to its landing page, which lists them.
            const isOpen = !navCollapsed && openGroup === section.title;

            
            
            
            const pin = sectionIndex === 1 && (
              <Link
                key="ai-health-pin"
                href="/owner/ai/health"
                aria-current={aiHealthActive ? "page" : undefined}
                className={`nav-btn nav-pin${aiHealthActive ? " active" : ""}`}
                title="AI Health"
              >
                <span className="nav-ico nav-pin-ico" aria-hidden="true">◆</span>
                <span className="nav-label">AI Health</span>
                {healthBeacon && <span className={`nav-pin-dot ai-status-${healthBeacon.tone}`} aria-hidden="true" />}
              </Link>
            );

            
            if (!section.items) {
              return (
                <div key={section.title} className="nav-group">
                  <Link
                    href={section.href}
                    aria-current={sectionActive ? "page" : undefined}
                    className={`nav-btn${sectionActive ? " active" : ""}`}
                    title={section.title}
                  >
                    <span className="nav-ico" aria-hidden="true">{section.icon}</span>
                    <span className="nav-label">{section.title}</span>
                  </Link>
                  {pin}
                </div>
              );
            }

            
            return (
              <div key={section.title} className="nav-group">
                {pin}
                <div className={`nav-group-head${sectionActive ? " active" : ""}`}>
                  <Link
                    href={section.href}
                    aria-current={sectionActive ? "page" : undefined}
                    className="nav-group-link"
                    title={section.title}
                  >
                    <span className="nav-ico" aria-hidden="true">{section.icon}</span>
                    <span className="nav-label">{section.title}</span>
                  </Link>
                  <button
                    type="button"
                    className="nav-group-toggle"
                    aria-expanded={isOpen}
                    aria-label={`${isOpen ? "Collapse" : "Expand"} ${section.title}`}
                    onClick={() => toggle(section.title)}
                  >
                    {isOpen ? "▾" : "▸"}
                  </button>
                </div>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <m.div
                      className="nav-sub"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                      style={{ overflow: "hidden" }}
                    >
                      {section.items.map((item) => {
                        const itemActive = inTrail(item.href);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            aria-current={itemActive ? "page" : undefined}
                            className={`nav-btn nav-sub-btn${itemActive ? " active" : ""}`}
                          >
                            <span>{item.label}</span>
                            {item.soon && <span className="nav-soon">Soon</span>}
                          </Link>
                        );
                      })}
                    </m.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </nav>

        <div className="side-foot">
          <div className="user-chip" title={userName}>
            <div className="avatar" aria-hidden="true">{initials}</div>
            <div className="user-chip-text">
              <strong>{userName}</strong>
              <span className="muted">Owner</span>
            </div>
          </div>
          <button type="button" className="nav-cmdk-hint" onClick={openCommandBar}>
            <kbd>⌘K</kbd> Ask AI
          </button>
          <LogoutButton className="danger-btn" />
        </div>
      </aside>
    </>
  );
}
