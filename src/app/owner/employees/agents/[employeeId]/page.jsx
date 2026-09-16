"use client";

import EmployeeDetailPage from "@/components/owner/EmployeeDetailPage";
import { rupee, fmtDate } from "@/lib/owner/format";
import { patientStatusCell } from "@/lib/owner/patientColumns";

const rowsColumns = [
  { key: "name", label: "Patient", sortable: true },
  { key: "phone", label: "Phone" },
  { key: "visitDate", label: "Visit Date", sortable: true, render: (r) => fmtDate(r.visitDate) },
  { key: "status", label: "Status", sortable: true, render: patientStatusCell },
  { key: "amountReceived", label: "Amount Received", align: "right", sortable: true, render: (r) => rupee(r.amountReceived) },
];

export default function AgentDetailPage() {
  return (
    <EmployeeDetailPage
      section="Agent"
      listHref="/owner/employees/agents"
      rowsColumns={rowsColumns}
      defaultSort="visitDate"
      trendLabel="Patients referred per day"
    />
  );
}
