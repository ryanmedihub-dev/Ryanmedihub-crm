"use client";

import LeadStatusReportPage from "@/components/owner/LeadStatusReportPage";
import { LEAD_BASE_COLUMNS, POOL_STATE_COLUMN } from "@/lib/owner/leadsColumns";
import { num } from "@/lib/owner/format";

const config = {
  preset: "unattempted",
  title: "Unattempted Leads",
  subtitle: "attempts: 0 — sorted oldest-first; an old unattempted lead is the most wasteful thing in the system",
  defaultSort: "createdAt",
  defaultSortDir: "asc",
  aiFeature: "leads.status",
  columns: [...LEAD_BASE_COLUMNS, POOL_STATE_COLUMN],
  kpis: (data) => {
    const rows = data.rows || [];
    const inPoolOnPage = rows.filter((r) => !r.assignedTo).length;
    return [
      { label: "Total Unattempted", value: num(data.total), sub: "attempts: 0", kind: "warn" },
      { label: "In Open Pool (this page)", value: num(inPoolOnPage), sub: "Unassigned", kind: "info" },
    ];
  },
};

export default function UnattemptedLeadsPage() {
  return <LeadStatusReportPage config={config} />;
}
