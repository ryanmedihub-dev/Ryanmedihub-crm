"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import LogoutButton from "../LogoutButton";
import { useShell } from "@/components/owner/ShellContext";

// Owner Panel v2 nav (F8): 10 top-level sections, most with sub-pages, as
// collapsible groups with active-trail highlighting. Each group header links to
// its section landing ("dashboard page"). Open/closed state is remembered.

const SECTIONS = [
  { title: "Dashboard", href: "/owner/dashboard", icon: "◎" },
  {
    title: "Employees",
    href: "/owner/employees",
    icon: "☏",
    items: [
      { label: "Agents", href: "/owner/employees/agents" },
      { label: "Counsellors", href: "/owner/employees/counsellors", soon: true },
      { label: "Surgery", href: "/owner/employees/surgery-staff" },
      { label: "HR", href: "/owner/employees/hr" },
      { label: "Other staff", href: "/owner/employees/other-staff" },
      { label: "TL & Manager", href: "/owner/employees/leadership" },
      { label: "callby Links", href: "/owner/employees/links" },
    ],
  },
  {
    title: "Calls",
    href: "/owner/calls",
    icon: "◉",
    items: [
      { label: "Live Agent Status", href: "/owner/calls/live" },
      { label: "Call Report", href: "/owner/calls/report" },
      { label: "Employee Call Report", href: "/owner/calls/employee-report" },
      { label: "Untracked Calls", href: "/owner/calls/untracked" },
      { label: "Forecast & Staffing", href: "/owner/calls/forecast" },
      { label: "Phone & SIM Health", href: "/owner/calls/sim-health", soon: true },
    ],
  },
  {
    title: "Leads",
    href: "/owner/leads",
    icon: "⚑",
    items: [
      { label: "Lead Report", href: "/owner/leads/report" },
      { label: "Interested", href: "/owner/leads/interested" },
      { label: "Follow-ups", href: "/owner/leads/follow-ups" },
      { label: "Not Interested / Lost", href: "/owner/leads/not-interested" },
      { label: "Unattempted", href: "/owner/leads/unattempted" },
      { label: "Retry & Recovery", href: "/owner/leads/retry" },
      { label: "Attention", href: "/owner/ai/attention" },
    ],
  },
  {
    title: "Patients",
    href: "/owner/patients",
    icon: "✚",
    items: [
      { label: "All Patients", href: "/owner/patients/all" },
      { label: "Not Converted", href: "/owner/patients/not-converted" },
      { label: "Booking Done", href: "/owner/patients/booking-done" },
      { label: "Converted", href: "/owner/patients/converted" },
      { label: "Surgery Done", href: "/owner/patients/surgery-done" },
      { label: "Direct", href: "/owner/patients/direct" },
      { label: "Counsellor Conversion", href: "/owner/patients/counsellor-conversion" },
      { label: "Surgery & OT Planner", href: "/owner/patients/surgery-planner" },
    ],
  },
  {
    title: "Marketing",
    href: "/owner/marketing",
    icon: "◈",
    items: [
      { label: "Active Ads", href: "/owner/marketing/campaigns" },
      { label: "Ad Spend Entry", href: "/owner/marketing/ad-spend" },
      { label: "Meta & Google", href: "/owner/marketing/platforms" },
      { label: "Meta vs Google", href: "/owner/marketing/comparison" },
    ],
  },
  {
    title: "HR",
    href: "/owner/hr",
    icon: "₹",
    items: [
      { label: "HR Statistics", href: "/owner/hr/statistics" },
      { label: "All Interviews", href: "/owner/hr/interviews" },
      { label: "Selected", href: "/owner/hr/selected" },
      { label: "Rejected", href: "/owner/hr/rejected" },
      { label: "By Position", href: "/owner/hr/by-position" },
      { label: "Incentives & Payroll", href: "/owner/hr/payroll", soon: true },
    ],
  },
  {
    title: "Finance",
    href: "/owner/finance",
    icon: "▦",
    items: [
      { label: "All Transactions", href: "/owner/finance/transactions" },
      { label: "Expenses", href: "/owner/finance/expenses" },
      { label: "Assets", href: "/owner/finance/assets" },
      { label: "Liabilities", href: "/owner/finance/liabilities" },
      { label: "Salary & Incentive", href: "/owner/finance/salary-incentive" },
      { label: "Rent", href: "/owner/finance/rent" },
    ],
  },
  {
    title: "AI",
    href: "/owner/ai",
    icon: "◆",
    items: [
      { label: "Attendance", href: "/owner/ai/attendance" },
      { label: "Attention", href: "/owner/ai/attention" },
      { label: "Suggestions", href: "/owner/ai/suggestions" },
      { label: "Sanya Assistant", href: "/owner/ai/sanya", soon: true },
      { label: "AI Health & Audit", href: "/owner/ai/health", soon: true },
      { label: "Clinical AI Quality", href: "/owner/ai/clinical-quality", soon: true },
    ],
  },
  { title: "Statistics", href: "/owner/statistics", icon: "⟐" },
];

const OPEN_KEY = "owner-nav-open";

export default function OwnerSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { navOpen, setNavOpen } = useShell();

  const inTrail = (href) => pathname === href || pathname.startsWith(href + "/");
  const activeSection = SECTIONS.find((s) => inTrail(s.href));

  const [open, setOpen] = useState(() => new Set());
  const [hydrated, setHydrated] = useState(false);

  // Restore remembered open groups; fall back to opening the active section.
  useEffect(() => {
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(OPEN_KEY) || "null");
    } catch {
      stored = null;
    }
    const next = new Set(Array.isArray(stored) ? stored : SECTIONS.filter((s) => s.items).map((s) => s.title));
    setOpen(next);
    setHydrated(true);
  }, []);

  // Always keep the active section expanded as the route changes.
  useEffect(() => {
    if (!activeSection?.items) return;
    setOpen((prev) => (prev.has(activeSection.title) ? prev : new Set(prev).add(activeSection.title)));
  }, [activeSection]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify([...open]));
    } catch {
      /* private mode — fine */
    }
  }, [open, hydrated]);

  // Close the mobile drawer on navigation.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname, setNavOpen]);

  const toggle = (title) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(title) ? next.delete(title) : next.add(title);
      return next;
    });

  const userName = session?.user?.name || session?.user?.email || "Owner";
  const initials = userName.slice(0, 2).toUpperCase();

  return (
    <>
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}
      <aside className={`sidebar${navOpen ? " open" : ""}`}>
        <div className="brand">
          <div className="logo" aria-hidden="true">◈</div>
          <div>
            <strong>RyanCRM</strong>
            <small>Owner command</small>
          </div>
        </div>

        <nav>
          {SECTIONS.map((section) => {
            const sectionActive = activeSection?.title === section.title;

            if (!section.items) {
              return (
                <Link
                  key={section.title}
                  href={section.href}
                  aria-current={sectionActive ? "page" : undefined}
                  className={`nav-btn${sectionActive ? " active" : ""}`}
                >
                  <span className="nav-ico" aria-hidden="true">{section.icon}</span>
                  <span>{section.title}</span>
                </Link>
              );
            }

            const isOpen = open.has(section.title);
            return (
              <div key={section.title} className="nav-group">
                <div className={`nav-group-head${sectionActive ? " active" : ""}`}>
                  <Link
                    href={section.href}
                    aria-current={pathname === section.href ? "page" : undefined}
                    className="nav-group-link"
                  >
                    <span className="nav-ico" aria-hidden="true">{section.icon}</span>
                    <span>{section.title}</span>
                  </Link>
                  <button
                    type="button"
                    className="nav-group-toggle"
                    aria-expanded={isOpen}
                    aria-label={`${isOpen ? "Collapse" : "Expand"} ${section.title}`}
                    onClick={() => toggle(section.title)}
                  >
                    <span aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
                  </button>
                </div>

                {isOpen && (
                  <div className="nav-sub">
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
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="side-foot">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div className="avatar">{initials}</div>
            <div style={{ minWidth: 0 }}>
              <strong style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{userName}</strong>
              <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>Owner</span>
            </div>
          </div>
          <LogoutButton className="danger-btn" />
        </div>
      </aside>
    </>
  );
}
