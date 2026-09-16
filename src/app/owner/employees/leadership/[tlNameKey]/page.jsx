"use client";

import { useParams } from "next/navigation";
import EmployeeReportPage from "@/components/owner/EmployeeReportPage";
import { SHARED_COLUMNS, callbyColumn } from "@/lib/owner/employeeColumns";
import { rupee, num } from "@/lib/owner/format";

// Team roster: the exact Agent table, server-filtered to one TL
// (src/app/api/owner/employees/leadership/[tlNameKey]/route.js re-runs the
// Agent query with tlName pinned) — no second "list of agents" implementation.
export default function TeamRosterPage() {
  const params = useParams();
  const tlNameKey = String(params.tlNameKey || "");
  const decoded = decodeURIComponent(tlNameKey);
  // The key is lower-cased for grouping; show it as a name.
  const tlName = decoded === "(unassigned)"
    ? "Unassigned (no TL)"
    : decoded.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

  const config = {
    title: `Team: ${tlName}`,
    subtitle: "Every agent on this team — same columns as the Agents page",
    endpoint: `/api/owner/employees/leadership/${encodeURIComponent(tlNameKey)}`,
    detailBase: "/owner/employees/agents",
    tableId: `employees-leadership-team-${tlNameKey}`,
    defaultSort: "totalCalls",
    columns: [
      SHARED_COLUMNS.name,
      SHARED_COLUMNS.phone,
      SHARED_COLUMNS.employeeId,
      SHARED_COLUMNS.branch,
      SHARED_COLUMNS.isactive,
      callbyColumn("totalCalls", "Total Calls"),
      callbyColumn("totalLeads", "Total Leads"),
      callbyColumn("interested", "Interested"),
      callbyColumn("followUps", "Follow-ups"),
      { key: "totalPatients", label: "Total Patients", align: "right", sortable: true, render: (r) => num(r.totalPatients) },
      { key: "amountReceived", label: "Amount Received", align: "right", sortable: true, render: (r) => rupee(r.amountReceived) },
      SHARED_COLUMNS.salaryPaid,
      SHARED_COLUMNS.incentivePaid,
      SHARED_COLUMNS.performance,
    ],
  };

  return <EmployeeReportPage config={config} />;
}
