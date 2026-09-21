"use client";

import EmployeeReportPage from "@/components/owner/EmployeeReportPage";
import { SHARED_COLUMNS, callbyColumn } from "@/lib/owner/employeeColumns";
import { rupee, num } from "@/lib/owner/format";

const config = {
  title: "Agents",
  subtitle: "Calls, engagement, conversion, salary and incentive",
  endpoint: "/api/owner/employees/agents",
  detailBase: "/owner/employees/agents",
  tableId: "employees-agents",
  defaultSort: "totalCalls",
  columns: [
    SHARED_COLUMNS.name,
    SHARED_COLUMNS.phone,
    SHARED_COLUMNS.employeeId,
    SHARED_COLUMNS.dateOfJoining,
    { ...SHARED_COLUMNS.role, label: "Post" },
    SHARED_COLUMNS.branch,
    SHARED_COLUMNS.tlName,
    SHARED_COLUMNS.isactive,
    SHARED_COLUMNS.salary,
    callbyColumn("totalCalls", "Total Calls"),
    callbyColumn("connected", "Connected"),
    callbyColumn("notConnected", "Not Connected"),
    callbyColumn("interested", "Interested"),
    callbyColumn("avgCallSeconds", "Avg. Call Length (s)"),
    { key: "referred", label: "Referred", align: "right", sortable: true, render: (r) => num(r.referred) },
    { key: "visited", label: "Visited", align: "right", sortable: true, render: (r) => num(r.visited) },
    { key: "converted", label: "Converted", align: "right", sortable: true, render: (r) => num(r.converted) },
    { key: "nonConverted", label: "Non-Converted", align: "right", sortable: true, defaultHidden: true, render: (r) => num(r.nonConverted) },
    { key: "amountReceived", label: "Amount Received", align: "right", sortable: true, render: (r) => rupee(r.amountReceived) },
    SHARED_COLUMNS.salaryPayable,
    SHARED_COLUMNS.salaryPaid,
    SHARED_COLUMNS.salaryPending,
    SHARED_COLUMNS.incentiveEarned,
    SHARED_COLUMNS.incentivePaid,
    SHARED_COLUMNS.incentiveRate,
    SHARED_COLUMNS.performance,
  ],
};

export default function AgentsPage() {
  return <EmployeeReportPage config={config} />;
}
