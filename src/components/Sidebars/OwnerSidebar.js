"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import LogoutButton from "../LogoutButton";
import { useShell } from "@/components/owner/ShellContext";

const SECTIONS = [
  { title: "Dashboard", href: "/owner/dashboard", icon: "◎" },
  {
    title: "Employees",
    href: "/owner/employees",
    icon: "☏",
    items: [
      { label: "Agents", href: "/owner/employees/agents" },
      { label: "Counsellors", href: "/owner/employees/counsellors" },
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
      { label: "Campaign Leads", href: "/owner/marketing/campaign-leads" },
      { label: "Campaign Performance", href: "/owner/marketing/performance" },
    ],
  },
  {
    title: "HR",
    href: "/owner/hr",
    icon: "₹",
    items: [
      { label: "All Interviews", href: "/owner/hr/interviews" },
      { label: "Selected", href: "/owner/hr/selected" },
      { label: "Rejected", href: "/owner/hr/rejected" },
      { label: "By Position", href: "/owner/hr/by-position" },
      { label: "HR Team", href: "/owner/employees/hr" },
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
      { label: "Sanya Assistant", href: "/owner/ai/sanya" },
      { label: "AI Health & Audit", href: "/owner/ai/health" },
      { label: "Clinical AI Quality", href: "/owner/ai/clinical-quality", soon: true },
    ],
  },
  { title: "Statistics", href: "/owner/statistics", icon: "⟐" },
];

const OPEN_KEY = "owner-nav-open-group";

export default function OwnerSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { navOpen, setNavOpen } = useShell();

  const inTrail = (href) => pathname === href || pathname.startsWith(href + "/");
  const activeSection = SECTIONS.find((s) => inTrail(s.href));

  const [openGroup, setOpenGroup] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  // Restore open group from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(OPEN_KEY);
      if (stored) setOpenGroup(stored);
    } catch {
      // Ignore private mode errors
    }
    setHydrated(true);
  }, []);

  // Automatically open the group containing the active page
  useEffect(() => {
    if (activeSection?.items && activeSection.title !== openGroup) {
      setOpenGroup(activeSection.title);
    }
  }, [activeSection]);

  // Persist to local storage
  useEffect(() => {
    if (!hydrated) return;
    try {
      if (openGroup) {
        localStorage.setItem(OPEN_KEY, openGroup);
      } else {
        localStorage.removeItem(OPEN_KEY);
      }
    } catch {
      // Ignore private mode errors
    }
  }, [openGroup, hydrated]);

  // Close mobile nav on route change
  useEffect(() => {
    setNavOpen(false);
  }, [pathname, setNavOpen]);

  // Accordion toggle: if clicked tab is already open, close it. Otherwise, open it (closing others automatically)
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
          <div className="logo" aria-hidden="true">◈</div>
          <div>
            <strong>RyanCRM</strong>
            <small>Owner command</small>
          </div>
        </div>

        <nav>
          {SECTIONS.map((section) => {
            const sectionActive = activeSection?.title === section.title;
            const isOpen = openGroup === section.title;

            // Single link (no sub-items)
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

            // Grouped link (accordion)
            return (
              <div key={section.title} className="nav-group">
                <div className={`nav-group-head${sectionActive ? " active" : ""}`}>
                  <Link
                    href={section.href}
                    aria-current={sectionActive ? "page" : undefined}
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
                    {isOpen ? "▾" : "▸"}
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
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", marginBottom: "var(--sp-3)" }}>
            <div className="avatar" aria-hidden="true">{initials}</div>
            <div style={{ minWidth: 0 }}>
              <strong style={{ display: "block", fontSize: "var(--fs-14)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {userName}
              </strong>
              <span className="muted" style={{ fontSize: "var(--fs-12)" }}>Owner</span>
            </div>
          </div>
          <LogoutButton className="danger-btn" />
        </div>
      </aside>
    </>
  );
}
