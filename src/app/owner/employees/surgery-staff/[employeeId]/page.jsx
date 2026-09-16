"use client";

import EmployeeDetailPage from "@/components/owner/EmployeeDetailPage";
import { fmtDate, num } from "@/lib/owner/format";

const rowsColumns = [
  { key: "name", label: "Patient", sortable: true },
  { key: "phone", label: "Phone" },
  { key: "surgeryDate", label: "Surgery Date", sortable: true, render: (r) => fmtDate(r.surgeryDate) },
  { key: "technique", label: "Technique", sortable: true, render: (r) => r.technique || "—" },
  { key: "graftsImplanted", label: "Grafts Implanted", align: "right", sortable: true, render: (r) => num(r.graftsImplanted) },
  { key: "OT", label: "OT", render: (r) => r.OT ?? "—" },
];

export default function SurgeryStaffDetailPage() {
  return (
    <EmployeeDetailPage
      section="Surgery"
      listHref="/owner/employees/surgery-staff"
      rowsColumns={rowsColumns}
      defaultSort="surgeryDate"
      trendLabel="Surgeries per day"
    />
  );
}
