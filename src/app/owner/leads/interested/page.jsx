"use client";

import LeadStatusReportPage from "@/components/owner/LeadStatusReportPage";
import { LEAD_BASE_COLUMNS, DAYS_SINCE_LAST_CALL_COLUMN } from "@/lib/owner/leadsColumns";
import { num, daysAgo } from "@/lib/owner/format";

const config = {
  preset: "interested",
  title: "Interested Leads",
  subtitle: "Sorted by staleness by default — anything past 2 days since the last call is flagged",
  defaultSort: "lastCallAt",
  defaultSortDir: "asc", 
  aiFeature: "leads.status",
  columns: [...LEAD_BASE_COLUMNS, DAYS_SINCE_LAST_CALL_COLUMN],
  kpis: (data) => {
    const rows = data.rows || [];
    const staleOnPage = rows.filter((r) => (daysAgo(r.lastCallAt) ?? 99) > 2).length;
    return [
      { label: "Total Interested", value: num(data.total), sub: "This period", kind: "info" },
      { label: "Stale (this page)", value: num(staleOnPage), sub: ">2 days since last call", kind: staleOnPage ? "warn" : "good" },
    ];
  },
};

export default function InterestedLeadsPage() {
  return <LeadStatusReportPage config={config} />;
}
