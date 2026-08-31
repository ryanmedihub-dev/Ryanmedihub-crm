"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import LogoutButton from "../LogoutButton";
import { useShell } from "@/components/owner/ShellContext";

const SECTIONS = [
  {
    title: "Executive",
    items: [
      { label: "Command Center", href: "/owner/dashboard", icon: "◎" },
      { label: "Live Workforce & Queue", href: "/owner/live-workforce", icon: "◉" },
      { label: "Agent 360°", href: "/owner/agent-360", icon: "☏" },
      { label: "TL & Manager", href: "/owner/leadership", icon: "⌘" },
    ],
  },
  {
    title: "Growth",
    items: [
      { label: "Ad Spend Entry", href: "/owner/ad-spend", icon: "✎" },
      { label: "Meta & Google", href: "/owner/marketing", icon: "◈" },
      { label: "Conversion Intelligence", href: "/owner/conversion", icon: "⟐" },
      { label: "Leak Control Room", href: "/owner/leaks", icon: "⚑" },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Phone & SIM Health", href: "/owner/sim-health", icon: "▤", soon: true },
      { label: "Productivity Attendance", href: "/owner/attendance", icon: "◷", soon: true },
      { label: "Forecast & Staffing", href: "/owner/forecast", icon: "◱" },
      { label: "AI Health & Audit", href: "/owner/ai-health", icon: "◆", soon: true },
    ],
  },
  {
    title: "Clinic Operations",
    items: [
      { label: "Patient Journey 360°", href: "/owner/patient-journey", icon: "✚" },
      { label: "Counsellor Conversion", href: "/owner/counsellor-conversion", icon: "❝" },
      { label: "Surgery & OT Planner", href: "/owner/surgery-planner", icon: "✂" },
      { label: "Clinical AI Quality", href: "/owner/clinical-ai-quality", icon: "⬡", soon: true },
    ],
  },
  {
    title: "People & Finance",
    items: [
      { label: "All Staff 360°", href: "/owner/staff-360", icon: "☰" },
      { label: "Incentives & Payroll", href: "/owner/payroll", icon: "₹", soon: true },
      { label: "HR Action Center", href: "/owner/hr-actions", icon: "▣", soon: true },
      { label: "Accounts, P&L & Expenses", href: "/owner/finance", icon: "▦" },
    ],
  },
];

export default function OwnerSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { navOpen, setNavOpen } = useShell();

  // close the mobile drawer whenever the route changes
  useEffect(() => {
    setNavOpen(false);
  }, [pathname, setNavOpen]);

  const isActive = (href) => pathname === href || pathname.startsWith(href + "/");

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
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <p className="nav-label">{section.title}</p>
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={`nav-btn${isActive(item.href) ? " active" : ""}`}
                >
                  <span className="nav-ico" aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                  {item.soon && <span className="nav-soon">Soon</span>}
                </Link>
              ))}
            </div>
          ))}
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
