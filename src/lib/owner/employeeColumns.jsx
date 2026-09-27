import Badge from "@/components/owner/Badge";
import { rupee, num, fmtDate } from "@/lib/owner/format";

const BAND_KIND = { Excellent: "good", Good: "info", Average: "warn", Bad: "bad" };

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

export function callbyValue(row, value) {
  if (!row.callbyLinked) return <Badge kind="warn">Not linked</Badge>;
  if (row.callbyMatched === false) return <Badge kind="warn">No callby record</Badge>;
  if (value === null || value === undefined) return <span className="muted">—</span>;
  return num(value);
}

export function callbyColumn(key, label, extra = {}) {
  return {
    key,
    label,
    align: "right",
    sortable: true,
    render: (r) => callbyValue(r, r[key]),
    csv: (r) => {
      if (!r.callbyLinked) return "Not linked";
      if (r.callbyMatched === false) return "No callby record";
      return r[key] ?? "—";
    },
    ...extra,
  };
}

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
  
  
  
  salary: { key: "salary", label: "Base Salary", align: "right", sortable: true, render: (r) => rupee(r.salary) },
  salaryPayable: { key: "salaryPayable", label: "Salary Due", align: "right", sortable: true, render: (r) => rupee(r.salaryPayable), csv: (r) => r.salaryPayable ?? 0 },
  salaryPending: {
    key: "salaryPending",
    label: "Salary Pending",
    align: "right",
    
    
    sortable: false,
    render: (r) => {
      const pending = (r.salaryPayable || 0) - (r.salaryPaid || 0);
      return pending ? <Badge kind="warn">{rupee(pending)}</Badge> : rupee(0);
    },
    csv: (r) => (r.salaryPayable || 0) - (r.salaryPaid || 0),
  },
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
