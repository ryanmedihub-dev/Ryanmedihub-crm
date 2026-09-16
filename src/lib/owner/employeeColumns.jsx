import Badge from "@/components/owner/Badge";
import { rupee, num, fmtDate } from "@/lib/owner/format";

// Column definitions shared by all six Employees pages (Owner Panel v2, Part 1) —
// the "shared by every role" columns from the brief, plus small render helpers
// reused by each role's role-specific columns.

const BAND_KIND = { Excellent: "good", Good: "info", Average: "warn", Bad: "bad" };

/** Performance cell: a band+score badge, "insufficient data", or "no KPI for this role". */
export function performanceCell(row) {
  const p = row.performance;
  if (!p || p.insufficientData === null) return <span className="muted">— (no KPI for this role)</span>;
  if (p.insufficientData) return <Badge kind="neutral">Insufficient data</Badge>;
  return (
    <span title={`${p.sample} ${p.sampleLabel}`}>
      <Badge kind={BAND_KIND[p.band] || "neutral"}>{p.band} · {p.score}</Badge>
    </span>
  );
}

/** A callby-sourced value — flags "Not linked" instead of showing a misleading zero. */
export function callbyValue(row, value) {
  if (!row.callbyLinked) return <Badge kind="warn">Not linked</Badge>;
  return num(value);
}

export function callbyColumn(key, label, extra = {}) {
  return {
    key,
    label,
    align: "right",
    sortable: true,
    render: (r) => callbyValue(r, r[key]),
    csv: (r) => (r.callbyLinked ? r[key] ?? 0 : "Not linked"),
    ...extra,
  };
}

// The columns every role shares (brief: name, phone, employeeId, dateOfJoining,
// tlName, managerName, branch, isactive, salary, incentive, salaryPaid,
// incentivePaid, performance).
export const SHARED_COLUMNS = {
  name: { key: "name", label: "Name", sortable: true, render: (r) => r.name || "—" },
  phone: { key: "phone", label: "Phone", render: (r) => r.phone || "—" },
  email: { key: "email", label: "Email", render: (r) => r.email || "—", defaultHidden: true },
  employeeId: { key: "employeeId", label: "Employee ID", render: (r) => r.employeeId || "—" },
  role: { key: "role", label: "Role", sortable: true, render: (r) => r.role || "—" },
  dateOfJoining: { key: "dateOfJoining", label: "Date of Joining", sortable: true, render: (r) => fmtDate(r.dateOfJoining) },
  tlName: { key: "tlName", label: "TL", render: (r) => r.tlName || "—" },
  managerName: { key: "managerName", label: "Manager", render: (r) => r.managerName || "— (unmapped)" },
  branch: { key: "branch", label: "Branch", render: (r) => r.branch || "—" },
  isactive: {
    key: "isactive",
    label: "Status",
    render: (r) => <Badge kind={r.isactive ? "good" : "neutral"} glyph>{r.isactive ? "Active" : "Inactive"}</Badge>,
    csv: (r) => (r.isactive ? "Active" : "Inactive"),
  },
  // Money columns are for the PAY MONTHS the date filter covers (payables are
  // keyed by period, not by when they were raised). "Earned" = payables raised
  // for the employee; "Paid" = what has actually been settled against them.
  salary: { key: "salary", label: "Base Salary", align: "right", sortable: true, render: (r) => rupee(r.salary) },
  salaryPaid: {
    key: "salaryPaid",
    label: "Salary Paid",
    align: "right",
    sortable: true,
    render: (r) => (r.salaryPayable ? <span title={`${rupee(r.salaryPayable)} due`}>{rupee(r.salaryPaid)}</span> : <span className="muted">—</span>),
    csv: (r) => r.salaryPaid ?? 0,
  },
  incentiveEarned: { key: "incentivePayable", label: "Incentive Earned", align: "right", sortable: true, render: (r) => (r.incentivePayable ? rupee(r.incentivePayable) : <span className="muted">—</span>), csv: (r) => r.incentivePayable ?? 0 },
  incentivePaid: { key: "incentivePaid", label: "Incentive Paid", align: "right", sortable: true, render: (r) => (r.incentivePayable ? rupee(r.incentivePaid) : <span className="muted">—</span>), csv: (r) => r.incentivePaid ?? 0 },
  // The usual per-patient rate from the employee record — a setting, not money.
  incentiveRate: {
    key: "incentiveRate",
    label: "Incentive Rate (setting)",
    align: "right",
    defaultHidden: true,
    render: (r) => (r.incentiveRate ? `₹${r.incentiveRate} / patient` : "—"),
  },
  performance: {
    key: "performance",
    label: "Performance",
    sortable: true,
    render: performanceCell,
    csv: (r) => (r.performance ? (r.performance.insufficientData ? "Insufficient data" : r.performance.insufficientData === null ? "N/A" : `${r.performance.band} (${r.performance.score})`) : "N/A"),
  },
};
