"use client";

import EmployeeDetailPage from "@/components/owner/EmployeeDetailPage";
import Badge from "@/components/owner/Badge";
import { rupee, fmtDate, num } from "@/lib/owner/format";

const STATUS_KIND = {
  CLOSED: "good", SURGERY_BOOKED: "good", BOOKING_DONE: "info",
  NOT_CONVERTED: "bad", NOT_VISITED: "neutral", NEW: "neutral",
};
const CONVERTED_STATUSES = new Set(["SURGERY_BOOKED", "CLOSED"]);

const rowsColumns = [
  { key: "name", label: "Patient", sortable: true },
  { key: "phone", label: "Phone" },
  { key: "visitDate", label: "Visit Date", sortable: true, render: (r) => fmtDate(r.visitDate) },
  { key: "status", label: "Status", render: (r) => <Badge kind={STATUS_KIND[r.status] || "neutral"}>{r.status}</Badge> },
  { key: "amountReceived", label: "Amount Received", align: "right", sortable: true, render: (r) => rupee(r.amountReceived) },
];

function kpis(data) {
  const rows = data.rows || [];
  const converted = rows.filter((r) => CONVERTED_STATUSES.has(r.status)).length;
  const amountReceived = rows.reduce((s, r) => s + (r.amountReceived || 0), 0);
  return [
    { label: "Referred Patients", value: num(rows.length), sub: "This period", kind: "info" },
    { label: "Converted", value: num(converted), sub: "Surgery booked/closed", kind: "good" },
    { label: "Amount Received", value: rupee(amountReceived), sub: "This period", kind: "info" },
    { label: "Salary Paid", value: rupee(data.compensation?.salaryPaid), sub: "This period", kind: "info" },
    { label: "Incentive Paid", value: rupee(data.compensation?.incentivePaid), sub: "This period", kind: "info" },
  ];
}

export default function AgentDetailPage() {
  return (
    <EmployeeDetailPage
      listHref="/owner/employees/agents"
      rowsColumns={rowsColumns}
      kpis={kpis}
      trendLabel="Patients referred per day"
    />
  );
}
