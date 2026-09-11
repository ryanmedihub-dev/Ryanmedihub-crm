"use client";

import EmployeeReportPage from "@/components/owner/EmployeeReportPage";
import { hrEmployeeConfig } from "@/lib/owner/hrEmployeeConfig";

export default function HrPage() {
  return <EmployeeReportPage config={hrEmployeeConfig} />;
}
