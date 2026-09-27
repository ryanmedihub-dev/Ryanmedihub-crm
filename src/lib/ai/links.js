

const LINK_ITEMS = [
  { href: "/owner/dashboard", label: "Dashboard" },
  { href: "/owner/employees", label: "Employees" },
  { href: "/owner/employees/agents", label: "Agents" },
  { href: "/owner/employees/counsellors", label: "Counsellors" },
  { href: "/owner/employees/surgery-staff", label: "Surgery staff" },
  { href: "/owner/employees/hr", label: "HR team" },
  { href: "/owner/employees/other-staff", label: "Other staff" },
  { href: "/owner/employees/leadership", label: "TL & Manager" },
  { href: "/owner/employees/links", label: "callby Links" },
  { href: "/owner/calls", label: "Calls" },
  { href: "/owner/calls/live", label: "Live Agent Status" },
  { href: "/owner/calls/report", label: "Call Report" },
  { href: "/owner/calls/employee-report", label: "Employee Call Report" },
  { href: "/owner/calls/untracked", label: "Untracked Calls" },
  { href: "/owner/calls/forecast", label: "Forecast & Staffing" },
  { href: "/owner/calls/sim-health", label: "Phone & SIM Health" },
  { href: "/owner/leads", label: "Leads" },
  { href: "/owner/leads/report", label: "Lead Report" },
  { href: "/owner/leads/interested", label: "Interested" },
  { href: "/owner/leads/follow-ups", label: "Follow-ups" },
  { href: "/owner/leads/not-interested", label: "Not Interested / Lost" },
  { href: "/owner/leads/unattempted", label: "Unattempted" },
  { href: "/owner/leads/retry", label: "Retry & Recovery" },
  { href: "/owner/patients", label: "Patients" },
  { href: "/owner/patients/all", label: "All Patients" },
  { href: "/owner/patients/not-converted", label: "Not Converted" },
  { href: "/owner/patients/booking-done", label: "Booking Done" },
  { href: "/owner/patients/converted", label: "Converted" },
  { href: "/owner/patients/surgery-done", label: "Surgery Done" },
  { href: "/owner/patients/direct", label: "Direct" },
  { href: "/owner/patients/counsellor-conversion", label: "Counsellor Conversion" },
  { href: "/owner/patients/surgery-planner", label: "Surgery & OT Planner" },
  { href: "/owner/marketing", label: "Marketing" },
  { href: "/owner/marketing/campaigns", label: "Active Ads" },
  { href: "/owner/marketing/ad-spend", label: "Ad Spend Entry" },
  { href: "/owner/marketing/platforms", label: "Meta & Google" },
  { href: "/owner/marketing/comparison", label: "Meta vs Google" },
  { href: "/owner/marketing/campaign-leads", label: "Campaign Leads" },
  { href: "/owner/marketing/performance", label: "Campaign Performance" },
  { href: "/owner/hr", label: "HR" },
  { href: "/owner/hr/interviews", label: "All Interviews" },
  { href: "/owner/hr/selected", label: "Selected" },
  { href: "/owner/hr/rejected", label: "Rejected" },
  { href: "/owner/hr/by-position", label: "By Position" },
  { href: "/owner/finance", label: "Finance" },
  { href: "/owner/finance/transactions", label: "All Transactions" },
  { href: "/owner/finance/expenses", label: "Expenses" },
  { href: "/owner/finance/assets", label: "Assets" },
  { href: "/owner/finance/liabilities", label: "Liabilities" },
  { href: "/owner/finance/salary-incentive", label: "Salary & Incentive" },
  { href: "/owner/finance/rent", label: "Rent" },
  { href: "/owner/ai", label: "AI" },
  { href: "/owner/ai/attendance", label: "Attendance" },
  { href: "/owner/ai/attention", label: "Attention" },
  { href: "/owner/ai/suggestions", label: "Suggestions" },
  { href: "/owner/ai/sanya", label: "Sanya Assistant" },
  { href: "/owner/ai/health", label: "AI Health & Audit" },
  { href: "/owner/ai/clinical-quality", label: "Clinical AI Quality" },
  { href: "/owner/statistics", label: "Statistics" },
];

export const OWNER_LINKS = LINK_ITEMS.map((i) => i.href);
export const OWNER_LINK_ITEMS = LINK_ITEMS;

const DETAIL_PATTERNS = [
  /^\/owner\/employees\/[a-z-]+\/[a-zA-Z0-9]+$/, 
  /^\/owner\/patients\/[a-zA-Z0-9]+$/, 
];

const LINK_SET = new Set(OWNER_LINKS);

export function isAllowedLink(href) {
  if (typeof href !== "string" || !href) return false;
  const path = href.split("?")[0];
  if (LINK_SET.has(path)) return true;
  return DETAIL_PATTERNS.some((re) => re.test(path));
}
