"use client";

import EmployeeDetailPage from "@/components/owner/EmployeeDetailPage";
import Badge from "@/components/owner/Badge";
import { rupee, fmtDate } from "@/lib/owner/format";

const STATUS_KIND = { Selected: "good", Rejected: "bad", "On Hold": "warn", "Interview Scheduled": "info", Applied: "neutral" };

const rowsColumns = [
  { key: "candidateName", label: "Candidate", sortable: true },
  { key: "position", label: "Position", sortable: true },
  { key: "status", label: "Status", sortable: true, render: (r) => <Badge kind={STATUS_KIND[r.status] || "neutral"}>{r.status}</Badge> },
  { key: "interviewDate", label: "Interview Date", sortable: true, render: (r) => fmtDate(r.interviewDate) },
  {
    key: "finalSalary",
    label: "Final Salary",
    align: "right",
    sortable: true,
    render: (r) => (r.status === "Selected" && r.finalSalary ? rupee(r.finalSalary) : <span className="muted">—</span>),
  },
];

export default function HrDetailPage() {
  return (
    <EmployeeDetailPage
      section="HR"
      listHref="/owner/employees/hr"
      rowsColumns={rowsColumns}
      defaultSort="interviewDate"
      trendLabel="Interviews per day"
    />
  );
}
