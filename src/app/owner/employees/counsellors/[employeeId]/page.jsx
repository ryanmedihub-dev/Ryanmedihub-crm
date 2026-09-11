"use client";

import EmployeeDetailPage from "@/components/owner/EmployeeDetailPage";
import Badge from "@/components/owner/Badge";
import { rupee, fmtDate, num } from "@/lib/owner/format";

const STATUS_KIND = {
  CLOSED: "good", SURGERY_BOOKED: "good", BOOKING_DONE: "info",
  NOT_CONVERTED: "bad", NOT_VISITED: "neutral", NEW: "neutral",
};

const rowsColumns = [
  { key: "name", label: "Patient", sortable: true },
  { key: "phone", label: "Phone" },
  { key: "visitDate", label: "Visit Date", sortable: true, render: (r) => fmtDate(r.visitDate) },
  { key: "packageBeforeConsult", label: "Package Quoted", align: "right", render: (r) => rupee(r.packageBeforeConsult) },
  { key: "packageAfterConsult", label: "Final Package", align: "right", render: (r) => rupee(r.packageAfterConsult) },
  { key: "discount", label: "Discount", align: "right", render: (r) => rupee(r.discount) },
  { key: "amountReceived", label: "Amount Received", align: "right", sortable: true, render: (r) => rupee(r.amountReceived) },
  { key: "status", label: "Status", render: (r) => <Badge kind={STATUS_KIND[r.status] || "neutral"}>{r.status}</Badge> },
];

function kpis(data) {
  const rows = data.rows || [];
  const converted = rows.filter((r) => (r.amountReceived || 0) > 0).length;
  const amountReceived = rows.reduce((s, r) => s + (r.amountReceived || 0), 0);
  const avgDiscount = rows.length ? rows.reduce((s, r) => s + (r.discount || 0), 0) / rows.length : 0;
  return [
    { label: "Patients Consulted", value: num(rows.length), sub: "This period", kind: "info" },
    { label: "Converted", value: num(converted), sub: "Token/booking paid", kind: "good" },
    { label: "Amount Received", value: rupee(amountReceived), sub: "This period", kind: "info" },
    { label: "Avg. Discount", value: rupee(avgDiscount), sub: "This period", kind: "info" },
    { label: "Incentive Paid", value: rupee(data.compensation?.incentivePaid), sub: "This period", kind: "info" },
  ];
}

export default function CounsellorDetailPage() {
  return (
    <EmployeeDetailPage
      listHref="/owner/employees/counsellors"
      rowsColumns={rowsColumns}
      kpis={kpis}
      trendLabel="Patients consulted per day"
    />
  );
}
