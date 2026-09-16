"use client";

import EmployeeReportPage from "@/components/owner/EmployeeReportPage";
import { SHARED_COLUMNS } from "@/lib/owner/employeeColumns";

// Reception, housekeeping, accountants, developers, office staff, etc. — no
// role-specific KPI in common across this bucket, so it's shared columns only.
// The Performance column reads "— (no KPI for this role)" rather than a
// fabricated score (see src/lib/owner/performance.js).
const config = {
  title: "Other Staff",
  subtitle: "Everyone outside Agents, Counsellors, Surgery and HR",
  endpoint: "/api/owner/employees/other-staff",
  detailBase: "/owner/employees/other-staff",
  tableId: "employees-other-staff",
  defaultSort: "name",
  columns: [
    SHARED_COLUMNS.name,
    SHARED_COLUMNS.phone,
    SHARED_COLUMNS.email,
    SHARED_COLUMNS.employeeId,
    SHARED_COLUMNS.role,
    SHARED_COLUMNS.dateOfJoining,
    SHARED_COLUMNS.tlName,
    SHARED_COLUMNS.managerName,
    SHARED_COLUMNS.branch,
    SHARED_COLUMNS.isactive,
    SHARED_COLUMNS.salary,
    SHARED_COLUMNS.incentiveRate,
    SHARED_COLUMNS.salaryPaid,
    SHARED_COLUMNS.incentivePaid,
    SHARED_COLUMNS.performance,
  ],
};

export default function OtherStaffPage() {
  return <EmployeeReportPage config={config} />;
}
