"use client";

import EmployeeDetailPage from "@/components/owner/EmployeeDetailPage";
import { rupee, fmtDate, num } from "@/lib/owner/format";

const rowsColumns = [
  { key: "name", label: "Patient", sortable: true },
  { key: "phone", label: "Phone" },
  { key: "surgeryDate", label: "Surgery Date", sortable: true, render: (r) => fmtDate(r.surgeryDate) },
  { key: "technique", label: "Technique" },
  { key: "graftsImplanted", label: "Grafts Implanted", align: "right", sortable: true, render: (r) => num(r.graftsImplanted) },
  { key: "OT", label: "OT", render: (r) => r.OT ?? "—" },
];

function kpis(data) {
  const rows = data.rows || [];
  const grafts = rows.reduce((s, r) => s + (r.graftsImplanted || 0), 0);
  return [
    { label: "Patients Operated", value: num(rows.length), sub: "This period", kind: "info" },
    { label: "Grafts Implanted", value: num(grafts), sub: "This period", kind: "info" },
    { label: "Avg. Grafts / Surgery", value: rows.length ? Math.round(grafts / rows.length) : "—", sub: "This period", kind: "info" },
    { label: "Salary Paid", value: rupee(data.compensation?.salaryPaid), sub: "This period", kind: "info" },
    { label: "Incentive Paid", value: rupee(data.compensation?.incentivePaid), sub: "This period", kind: "info" },
  ];
}

export default function SurgeryStaffDetailPage() {
  return (
    <EmployeeDetailPage
      listHref="/owner/employees/surgery-staff"
      rowsColumns={rowsColumns}
      kpis={kpis}
      trendLabel="Surgeries per day"
    />
  );
}
