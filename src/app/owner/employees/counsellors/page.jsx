"use client";

import EmployeeReportPage from "@/components/owner/EmployeeReportPage";
import { SHARED_COLUMNS } from "@/lib/owner/employeeColumns";
import { rupee, num } from "@/lib/owner/format";

const config = {
  title: "Counsellors",
  subtitle: "Patients consulted, conversion, package movement and discounting",
  endpoint: "/api/owner/employees/counsellors",
  detailBase: "/owner/employees/counsellors",
  tableId: "employees-counsellors",
  defaultSort: "patientsConsulted",
  columns: [
    SHARED_COLUMNS.name,
    SHARED_COLUMNS.phone,
    SHARED_COLUMNS.employeeId,
    SHARED_COLUMNS.dateOfJoining,
    { ...SHARED_COLUMNS.tlName, defaultHidden: true },
    { ...SHARED_COLUMNS.managerName, defaultHidden: true },
    SHARED_COLUMNS.branch,
    SHARED_COLUMNS.isactive,
    { key: "patientsConsulted", label: "Patients Consulted", align: "right", sortable: true, render: (r) => num(r.patientsConsulted) },
    { key: "converted", label: "Converted", align: "right", sortable: true, render: (r) => num(r.converted) },
    { key: "nonConverted", label: "Non-Converted", align: "right", sortable: true, defaultHidden: true, render: (r) => num(r.nonConverted) },
    {
      key: "packageBeforeConsult", label: "Package Quoted (pre-consult)", align: "right", sortable: true, defaultHidden: true,
      render: (r) => rupee(r.packageBeforeConsult),
    },
    {
      key: "packageAfterConsult", label: "Final Package (post-consult)", align: "right", sortable: true,
      render: (r) => rupee(r.packageAfterConsult),
    },
    { key: "amountReceived", label: "Amount Received", align: "right", sortable: true, render: (r) => rupee(r.amountReceived) },
    { key: "avgDiscount", label: "Avg. Discount", align: "right", sortable: true, render: (r) => rupee(r.avgDiscount) },
    SHARED_COLUMNS.salary,
    SHARED_COLUMNS.incentiveRate,
    SHARED_COLUMNS.salaryPaid,
    SHARED_COLUMNS.incentivePaid,
    SHARED_COLUMNS.performance,
  ],
};

export default function CounsellorsPage() {
  return <EmployeeReportPage config={config} />;
}
