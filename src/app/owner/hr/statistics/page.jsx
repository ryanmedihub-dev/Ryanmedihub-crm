"use client";

import EmployeeReportPage from "@/components/owner/EmployeeReportPage";
import { hrEmployeeConfig } from "@/lib/owner/hrEmployeeConfig";

// Same report as /owner/employees/hr (Part 1) — reused verbatim rather than
// re-derived, reachable from the HR section too.
export default function HrStatisticsPage() {
  return <EmployeeReportPage config={hrEmployeeConfig} />;
}
