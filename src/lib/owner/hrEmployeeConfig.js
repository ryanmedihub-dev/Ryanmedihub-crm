import { SHARED_COLUMNS } from "@/lib/owner/employeeColumns";
import { num } from "@/lib/owner/format";

export const hrEmployeeConfig = {
  title: "HR",
  subtitle: "Interviews conducted, selection outcomes",
  endpoint: "/api/owner/employees/hr",
  detailBase: "/owner/employees/hr",
  tableId: "employees-hr",
  defaultSort: "totalInterviews",
  
  
  
  
  defaultRange: "Last 30 Days",
  aiFeature: "employees.hr",
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
    { key: "totalInterviews", label: "Total Interviews", align: "right", sortable: true, render: (r) => num(r.totalInterviews) },
    { key: "selected", label: "Selected", align: "right", sortable: true, render: (r) => num(r.selected) },
    { key: "rejected", label: "Rejected", align: "right", sortable: true, defaultHidden: true, render: (r) => num(r.rejected) },
    { key: "hold", label: "On Hold", align: "right", sortable: true, defaultHidden: true, render: (r) => num(r.hold) },
    SHARED_COLUMNS.salary,
    SHARED_COLUMNS.salaryPaid,
    SHARED_COLUMNS.incentiveEarned,
    SHARED_COLUMNS.incentivePaid,
    SHARED_COLUMNS.incentiveRate,
    SHARED_COLUMNS.performance,
  ],
};
