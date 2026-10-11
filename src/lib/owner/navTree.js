// Single source of truth for /owner navigation.
// Consumers: OwnerSidebar (tree), AiCommandBar
// via src/lib/ai/links.js (flat list + link allow-list for AI-generated hrefs).
// Adding a page = one entry here.

export const OWNER_SECTIONS = [
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
      // Cross-link into the Employees section; not a page of its own.
      { label: "HR Team", href: "/owner/employees/hr", crossLink: true },
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

// Flat list for the command palette and the AI link allow-list. A cross-link
// appears once, under the section that owns the route.
export const OWNER_NAV_ITEMS = OWNER_SECTIONS.flatMap((s) => [
  { href: s.href, label: s.title, section: s.title },
  ...(s.items || [])
    .filter((i) => !i.crossLink)
    .map((i) => ({ href: i.href, label: i.label, section: s.title })),
]);

/** The section that owns a pathname (sidebar active state). */
export function sectionFor(pathname) {
  if (!pathname) return null;
  const path = pathname.split("?")[0].replace(/\/$/, "");
  return OWNER_SECTIONS.find((s) => path === s.href || path.startsWith(s.href + "/")) || null;
}
