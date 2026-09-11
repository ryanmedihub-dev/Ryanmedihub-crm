"use client";

import EmployeeReportPage from "@/components/owner/EmployeeReportPage";
import { SHARED_COLUMNS, callbyColumn } from "@/lib/owner/employeeColumns";
import { rupee, num } from "@/lib/owner/format";

// Default-visible: name, employeeId, tlName, totalCalls, totalLeads, interested,
// followUps, totalPatients, amountReceived, performance — everything else (the
// table is ~23 columns) is one click away via ReportTable's column toggle.
const config = {
  title: "Agents",
  subtitle: "Calls, leads, conversion, salary and incentive",
  endpoint: "/api/owner/employees/agents",
  detailBase: "/owner/employees/agents",
  tableId: "employees-agents",
  defaultSort: "totalCalls",
  columns: [
    SHARED_COLUMNS.name,
    SHARED_COLUMNS.phone,
    SHARED_COLUMNS.employeeId,
    SHARED_COLUMNS.dateOfJoining,
    SHARED_COLUMNS.tlName,
    SHARED_COLUMNS.managerName,
    SHARED_COLUMNS.branch,
    SHARED_COLUMNS.isactive,
    callbyColumn("totalCalls", "Total Calls"),
    callbyColumn("totalLeads", "Total Leads"),
    callbyColumn("interested", "Interested"),
    { ...callbyColumn("notInterested", "Not Interested"), defaultHidden: true },
    callbyColumn("followUps", "Follow-ups"),
    {
      ...callbyColumn("unattemptedLeads", "Unattempted (never contacted)"),
      defaultHidden: true,
    },
    { key: "totalPatients", label: "Total Patients", align: "right", sortable: true, render: (r) => num(r.totalPatients) },
    { key: "converted", label: "Converted", align: "right", sortable: true, defaultHidden: true, render: (r) => num(r.converted) },
    { key: "nonConverted", label: "Non-Converted", align: "right", sortable: true, defaultHidden: true, render: (r) => num(r.nonConverted) },
    { key: "amountReceived", label: "Amount Received", align: "right", sortable: true, render: (r) => rupee(r.amountReceived) },
    SHARED_COLUMNS.salary,
    SHARED_COLUMNS.incentiveRate,
    SHARED_COLUMNS.salaryPaid,
    SHARED_COLUMNS.incentivePaid,
    SHARED_COLUMNS.performance,
  ],
};

export default function AgentsPage() {
  return <EmployeeReportPage config={config} />;
}
