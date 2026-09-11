"use client";

import EmployeeDetailPage from "@/components/owner/EmployeeDetailPage";
import Badge from "@/components/owner/Badge";
import { rupee, fmtDate, num } from "@/lib/owner/format";

const STATUS_KIND = { Selected: "good", Rejected: "bad", "On Hold": "warn", "Interview Scheduled": "info", Applied: "neutral" };

const rowsColumns = [
  { key: "candidateName", label: "Candidate", sortable: true },
  { key: "position", label: "Position" },
  { key: "status", label: "Status", render: (r) => <Badge kind={STATUS_KIND[r.status] || "neutral"}>{r.status}</Badge> },
  { key: "interviewDate", label: "Interview Date", sortable: true, render: (r) => fmtDate(r.interviewDate) },
  { key: "finalSalary", label: "Final Salary", align: "right", render: (r) => rupee(r.finalSalary) },
];

function kpis(data) {
  const rows = data.rows || [];
  const selected = rows.filter((r) => r.status === "Selected").length;
  const rejected = rows.filter((r) => r.status === "Rejected").length;
  return [
    { label: "Total Interviews", value: num(rows.length), sub: "This period", kind: "info" },
    { label: "Selected", value: num(selected), sub: "This period", kind: "good" },
    { label: "Rejected", value: num(rejected), sub: "This period", kind: "bad" },
    { label: "Salary Paid", value: rupee(data.compensation?.salaryPaid), sub: "This period", kind: "info" },
    { label: "Incentive Paid", value: rupee(data.compensation?.incentivePaid), sub: "This period", kind: "info" },
  ];
}

export default function HrDetailPage() {
  return (
    <EmployeeDetailPage
      listHref="/owner/employees/hr"
      rowsColumns={rowsColumns}
      kpis={kpis}
      trendLabel="Interviews per day"
    />
  );
}
