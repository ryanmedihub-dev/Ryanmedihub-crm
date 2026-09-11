"use client";

import LeadStatusReportPage from "@/components/owner/LeadStatusReportPage";
import { LEAD_BASE_COLUMNS, OVERDUE_BY_COLUMN } from "@/lib/owner/leadsColumns";
import { num, daysAgo } from "@/lib/owner/format";

const config = {
  preset: "followUps",
  title: "Follow-ups",
  subtitle: "Sorted overdue-first — an overdue follow-up is unmistakable, not just a date column",
  defaultSort: "followUpDate",
  defaultSortDir: "asc",
  columns: [...LEAD_BASE_COLUMNS, OVERDUE_BY_COLUMN],
  kpis: (data) => {
    const rows = data.rows || [];
    const overdueOnPage = rows.filter((r) => r.followUpDate && (daysAgo(r.followUpDate) ?? 0) > 0).length;
    return [
      { label: "Total Follow-ups", value: num(data.total), sub: "This period", kind: "info" },
      { label: "Overdue (this page)", value: num(overdueOnPage), sub: "Past their follow-up date", kind: overdueOnPage ? "bad" : "good" },
    ];
  },
};

export default function FollowUpsPage() {
  return <LeadStatusReportPage config={config} />;
}
