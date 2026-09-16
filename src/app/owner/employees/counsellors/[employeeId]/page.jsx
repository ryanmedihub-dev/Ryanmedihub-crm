"use client";

import EmployeeDetailPage from "@/components/owner/EmployeeDetailPage";
import { rupee, fmtDate } from "@/lib/owner/format";
import { patientStatusCell } from "@/lib/owner/patientColumns";

const rowsColumns = [
  { key: "name", label: "Patient", sortable: true },
  { key: "phone", label: "Phone" },
  { key: "visitDate", label: "Visit Date", sortable: true, render: (r) => fmtDate(r.visitDate) },
  { key: "packageBeforeConsult", label: "Package Quoted", align: "right", render: (r) => rupee(r.packageBeforeConsult) },
  { key: "packageAfterConsult", label: "Final Package", align: "right", sortable: true, render: (r) => rupee(r.packageAfterConsult) },
  { key: "discount", label: "Discount", align: "right", sortable: true, render: (r) => rupee(r.discount) },
  { key: "amountReceived", label: "Amount Received", align: "right", sortable: true, render: (r) => rupee(r.amountReceived) },
  { key: "status", label: "Status", sortable: true, render: patientStatusCell },
];

export default function CounsellorDetailPage() {
  return (
    <EmployeeDetailPage
      section="Counsellor"
      listHref="/owner/employees/counsellors"
      rowsColumns={rowsColumns}
      defaultSort="visitDate"
      trendLabel="Patients consulted per day"
    />
  );
}
