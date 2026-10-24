"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { m, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  PhoneCall,
  UserPlus,
  HeartPulse,
  Megaphone,
  Briefcase,
  Wallet,
  Sparkles,
  BarChart3,
  Activity,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import LogoutButton from "../LogoutButton";
import { useShell } from "@/components/owner/ShellContext";
import AiOrb from "@/components/owner/ai/AiOrb";
import { useAiHealthBeacon } from "@/lib/ai/client/useAiHealthBeacon";
import { OWNER_SECTIONS as SECTIONS, sectionFor } from "@/lib/owner/navTree";

const SECTION_ICONS = {
  Dashboard: LayoutDashboard,
  Employees: Users,
  Calls: PhoneCall,
  Leads: UserPlus,
  Patients: HeartPulse,
  Marketing: Megaphone,
  HR: Briefcase,
  Finance: Wallet,
  AI: Sparkles,
  Statistics: BarChart3,
};

const OPEN_KEY = "owner-nav-open-group";

export default function OwnerSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { navOpen, setNavOpen, navCollapsed, setNavCollapsed, toggleNavCollapsed, openCommandBar } = useShell();
  const healthBeacon = useAiHealthBeacon();
  const aiHealthActive = pathname === "/owner/ai/health";

  const inTrail = useCallback(
    (href) => pathname === href || pathname.startsWith(href + "/"),
    [pathname]
  );
  const activeSection = sectionFor ? sectionFor(pathname) : SECTIONS.find((s) => inTrail(s.href));

  const [openGroup, setOpenGroup] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  // Restore stored group or auto-expand active group on initial mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(OPEN_KEY);
      if (stored) {
        setOpenGroup(stored);
      } else if (activeSection?.items) {
        setOpenGroup(activeSection.title);
      }
    } catch {
      if (activeSection?.items) setOpenGroup(activeSection.title);
    }
    setHydrated(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-expand group when route changes
  useEffect(() => {
    if (activeSection?.items) {
      setOpenGroup(activeSection.title);
    }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist openGroup in localStorage
  useEffect(() => {
    if (!hydrated) return;
    try {
      if (openGroup) {
        localStorage.setItem(OPEN_KEY, openGroup);
      } else {
        localStorage.removeItem(OPEN_KEY);
      }
    } catch {
      // ignore
    }
  }, [openGroup, hydrated]);

  // Close mobile drawer on navigation
  useEffect(() => {
    setNavOpen(false);
  }, [pathname, setNavOpen]);

  // Close mobile drawer on Escape key
  useEffect(() => {
    if (!navOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navOpen, setNavOpen]);

  // Lock body scroll on mobile when drawer is modal
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (navOpen && window.innerWidth <= 900) {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [navOpen]);

  // Keyboard shortcut Ctrl+B / Cmd+B to toggle sidebar collapse on desktop
  useEffect(() => {
    const handleShortcut = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleNavCollapsed();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [toggleNavCollapsed]);

  const toggle = (title) => {
    setOpenGroup((prev) => (prev === title ? null : title));
  };

  const handleGroupClick = (section) => {
    if (navCollapsed) {
      if (setNavCollapsed) setNavCollapsed(false);
      else toggleNavCollapsed();
      setOpenGroup(section.title);
    } else {
      toggle(section.title);
    }
  };

  const isItemActive = (item, section) => {
    if (item.href === section.href) {
      return pathname === item.href;
    }
    return pathname === item.href || pathname.startsWith(item.href + "/");
  };

  const userName = session?.user?.name || session?.user?.email || "Owner";
  const initials = userName.slice(0, 2).toUpperCase();

  return (
    <>
      <div
        className={`scrim${navOpen ? " active" : ""}`}
        onClick={() => setNavOpen(false)}
        aria-hidden="true"
      />

      <aside
        className={`sidebar${navOpen ? " open" : ""}${navCollapsed ? " collapsed" : ""}`}
        aria-label="Owner navigation"
      >
        <div className="brand">
          <AiOrb state="idle" size={36} />
          {!navCollapsed && (
            <div className="brand-text">
              <strong>RyanCRM</strong>
              <small>Neural Command</small>
            </div>
          )}
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
            const isOpen = !navCollapsed && openGroup === section.title;
            const Icon = SECTION_ICONS[section.title];
            const groupId = section.title.toLowerCase().replace(/[^a-z0-9]/g, "-");

            const pin = sectionIndex === 1 && (
              <Link
                key="ai-health-pin"
                href="/owner/ai/health"
                aria-current={aiHealthActive ? "page" : undefined}
                className={`nav-btn nav-pin${aiHealthActive ? " active" : ""}`}
                title="AI Health & Audit"
                aria-label="AI Health & Audit"
              >
                <span className="nav-ico nav-pin-ico" aria-hidden="true">
                  <Activity size={15} strokeWidth={2} />
                </span>
                {!navCollapsed && <span className="nav-label">AI Health</span>}
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
                    aria-label={section.title}
                  >
                    <span className="nav-ico" aria-hidden="true">
                      {Icon ? <Icon size={16} strokeWidth={2} /> : section.icon}
                    </span>
                    {!navCollapsed && <span className="nav-label">{section.title}</span>}
                  </Link>
                  {pin}
                </div>
              );
            }

            return (
              <div key={section.title} className="nav-group">
                {pin}
                <button
                  type="button"
                  className={`nav-group-head${sectionActive ? " active" : ""}`}
                  onClick={() => handleGroupClick(section)}
                  aria-expanded={!navCollapsed && isOpen}
                  aria-controls={`sub-${groupId}`}
                  title={section.title}
                  aria-label={`${section.title} section, ${isOpen ? "expanded" : "collapsed"}`}
                >
                  <span className="nav-ico" aria-hidden="true">
                    {Icon ? <Icon size={16} strokeWidth={2} /> : section.icon}
                  </span>
                  {!navCollapsed && (
                    <>
                      <span className="nav-group-title">{section.title}</span>
                      <span className={`nav-group-chevron${isOpen ? " open" : ""}`} aria-hidden="true">
                        <ChevronDown size={14} />
                      </span>
                    </>
                  )}
                </button>

                <AnimatePresence initial={false}>
                  {!navCollapsed && isOpen && (
                    <m.div
                      id={`sub-${groupId}`}
                      className="nav-sub"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                      style={{ overflow: "hidden" }}
                    >
                      {section.items.map((item) => {
                        const itemActive = isItemActive(item, section);
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
          <div className="user-profile user-chip" title={userName}>
            <div className="avatar" aria-hidden="true" title={userName}>{initials}</div>
            {!navCollapsed && (
              <div className="user-chip-text" style={{ minWidth: 0 }}>
                <strong style={{ display: "block", fontSize: "var(--fs-14)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {userName}
                </strong>
                <span className="muted" style={{ fontSize: "var(--fs-12)" }}>Owner</span>
              </div>
            )}
          </div>
          <button
            type="button"
            className="nav-cmdk-hint"
            onClick={openCommandBar}
            title="Ask AI / Command (⌘K)"
            aria-label="Ask AI / Command (⌘K)"
          >
            <Sparkles size={14} className="cmd-ico" aria-hidden="true" />
            {!navCollapsed && (
              <>
                <kbd>⌘K</kbd> Ask AI / Command
              </>
            )}
          </button>
          <LogoutButton className="danger-btn" />

          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={toggleNavCollapsed}
            title={navCollapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
            aria-label={navCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {navCollapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /> <span>Collapse</span></>}
          </button>
        </div>
      </aside>
    </>
  );
}
