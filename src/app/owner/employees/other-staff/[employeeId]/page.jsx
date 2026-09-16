"use client";

import EmployeeDetailPage from "@/components/owner/EmployeeDetailPage";

// No role-specific metric exists for this bucket (see src/lib/owner/performance.js) —
// the detail page is header + compensation only; the API returns no rows/trend.
export default function OtherStaffDetailPage() {
  return (
    <EmployeeDetailPage
      section="Other"
      listHref="/owner/employees/other-staff"
      rowsColumns={[]}
      trendLabel="No role-specific activity tracked for this bucket"
    />
  );
}
