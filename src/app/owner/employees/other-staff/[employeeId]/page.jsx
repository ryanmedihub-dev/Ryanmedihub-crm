"use client";

import EmployeeDetailPage from "@/components/owner/EmployeeDetailPage";
import { rupee } from "@/lib/owner/format";

// No role-specific metric exists for this bucket (see src/lib/owner/performance.js) —
// the detail page is header + compensation only, same as the list page's columns.
const rowsColumns = [{ key: "name", label: "Name" }];

function kpis(data) {
  return [
    { label: "Base Salary", value: rupee(data.employee?.salary), sub: "Monthly", kind: "info" },
    { label: "Salary Paid", value: rupee(data.compensation?.salaryPaid), sub: "This period", kind: "info" },
    { label: "Incentive Paid", value: rupee(data.compensation?.incentivePaid), sub: "This period", kind: "info" },
  ];
}

export default function OtherStaffDetailPage() {
  return (
    <EmployeeDetailPage
      listHref="/owner/employees/other-staff"
      rowsColumns={rowsColumns}
      kpis={kpis}
      trendLabel="No role-specific activity tracked for this bucket"
    />
  );
}
