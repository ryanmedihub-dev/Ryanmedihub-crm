"use client";

import EmployeeDetailPage from "@/components/owner/EmployeeDetailPage";

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
