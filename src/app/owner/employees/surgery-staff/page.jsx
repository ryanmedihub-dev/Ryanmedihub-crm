"use client";

import EmployeeReportPage from "@/components/owner/EmployeeReportPage";
import { SHARED_COLUMNS } from "@/lib/owner/employeeColumns";
import { num } from "@/lib/owner/format";

const config = {
  title: "Surgery Staff",
  subtitle: "Doctors, technicians and implanters — cases and grafts",
  endpoint: "/api/owner/employees/surgery-staff",
  detailBase: "/owner/employees/surgery-staff",
  tableId: "employees-surgery-staff",
  defaultSort: "patientsOperated",
  columns: [
    SHARED_COLUMNS.name,
    SHARED_COLUMNS.phone,
    SHARED_COLUMNS.email,
    SHARED_COLUMNS.employeeId,
    SHARED_COLUMNS.role,
    SHARED_COLUMNS.dateOfJoining,
    { ...SHARED_COLUMNS.tlName, defaultHidden: true },
    { ...SHARED_COLUMNS.managerName, defaultHidden: true },
    SHARED_COLUMNS.branch,
    SHARED_COLUMNS.isactive,
    { key: "patientsOperated", label: "Patients Operated", align: "right", sortable: true, render: (r) => num(r.patientsOperated) },
    { key: "graftsImplanted", label: "Grafts Implanted", align: "right", sortable: true, render: (r) => num(r.graftsImplanted) },
    SHARED_COLUMNS.salary,
    SHARED_COLUMNS.salaryPaid,
    SHARED_COLUMNS.incentiveEarned,
    SHARED_COLUMNS.incentivePaid,
    SHARED_COLUMNS.incentiveRate,
    SHARED_COLUMNS.performance,
  ],
};

export default function SurgeryStaffPage() {
  return <EmployeeReportPage config={config} />;
}
