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
  phone: { key: "phone", label: "Phone", render: (r) => r.phone || "—", defaultHidden: true },
  employeeId: { key: "employeeId", label: "Employee ID", render: (r) => r.employeeId || "—" },
  dateOfJoining: { key: "dateOfJoining", label: "Date of Joining", render: (r) => fmtDate(r.dateOfJoining), defaultHidden: true },
  tlName: { key: "tlName", label: "TL", render: (r) => r.tlName || "—" },
  managerName: { key: "managerName", label: "Manager", render: (r) => r.managerName || "— (unmapped)", defaultHidden: true },
  branch: { key: "branch", label: "Branch", render: (r) => r.branch || "—", defaultHidden: true },
  isactive: {
    key: "isactive",
    label: "Status",
    defaultHidden: true,
    render: (r) => <Badge kind={r.isactive ? "good" : "neutral"} glyph>{r.isactive ? "Active" : "Inactive"}</Badge>,
    csv: (r) => (r.isactive ? "Active" : "Inactive"),
  },
  // incentiveRate is a RATE, not an earned amount — labelled explicitly so it's
  // never mistaken for money paid (see incentivePaid for that).
  salary: { key: "salary", label: "Base Salary", align: "right", render: (r) => rupee(r.salary), defaultHidden: true },
  incentiveRate: {
    key: "incentiveRate",
    label: "Incentive Rate",
    align: "right",
    defaultHidden: true,
    render: (r) => (r.incentiveRate ? `${r.incentiveRate} (rate)` : "—"),
  },
  salaryPaid: { key: "salaryPaid", label: "Salary Paid", align: "right", sortable: true, render: (r) => rupee(r.salaryPaid) },
  incentivePaid: { key: "incentivePaid", label: "Incentive Paid", align: "right", sortable: true, defaultHidden: true, render: (r) => rupee(r.incentivePaid) },
  performance: {
    key: "performance",
    label: "Performance",
    sortable: true,
    render: performanceCell,
    csv: (r) => (r.performance ? (r.performance.insufficientData ? "Insufficient data" : r.performance.insufficientData === null ? "N/A" : `${r.performance.band} (${r.performance.score})`) : "N/A"),
  },
};
