import Badge from "@/components/owner/Badge";
import { rupee, fmtDate } from "@/lib/owner/format";

const STATUS_KIND = {
  Applied: "neutral", "Interview Scheduled": "info", Selected: "good", Rejected: "bad", "On Hold": "warn",
};

export function interviewStatusBadge(status) {
  return <Badge kind={STATUS_KIND[status] || "neutral"}>{status || "—"}</Badge>;
}

export const INTERVIEW_BASE_COLUMNS = [
  { key: "date", label: "Date", sortable: true, render: (r) => fmtDate(r.date) },
  { key: "name", label: "Candidate", sortable: true, render: (r) => r.name || "Unknown" },
  { key: "position", label: "Position", sortable: true, render: (r) => r.position || "—" },
  { key: "phone", label: "Phone", defaultHidden: true, render: (r) => r.phone || "—" },
  { key: "experienceType", label: "Experience", render: (r) => r.experienceType || "—" },
  { key: "yearsOfExperience", label: "Years", align: "right", defaultHidden: true, render: (r) => r.yearsOfExperience ?? "—" },
  { key: "previousCompany", label: "Previous Company", defaultHidden: true, render: (r) => r.previousCompany || "—" },
  { key: "previousSalary", label: "Previous Salary", align: "right", defaultHidden: true, render: (r) => rupee(r.previousSalary) },
  { key: "expectedSalary", label: "Expected Salary", align: "right", sortable: true, render: (r) => rupee(r.expectedSalary) },
  { key: "finalSalary", label: "Final Salary", align: "right", sortable: true, render: (r) => rupee(r.finalSalary) },
  { key: "source", label: "Source", render: (r) => r.source || "—" },
  { key: "reference", label: "Reference", defaultHidden: true, render: (r) => r.reference || "—" },
  { key: "communication", label: "Communication", align: "right", defaultHidden: true, render: (r) => r.communication ?? "—" },
  { key: "status", label: "Outcome", render: (r) => interviewStatusBadge(r.status) },
  { key: "assignedHr", label: "Conducted By", render: (r) => r.assignedHr?.name || "—" },
];

export const REJECTION_REASON_COLUMN = {
  key: "reasonForLeaving",
  label: "Reason",
  render: (r) => r.hrComments || r.finalRemarks || r.reasonForLeaving || <span className="muted">—</span>,
};

export const JOINED_COLUMN = {
  key: "hiredEmployeeId",
  label: "Joined",
  render: (r) => (r.hiredEmployeeId ? <Badge kind="good">Joined</Badge> : <Badge kind="neutral">Not marked</Badge>),
};

export function avgSalaryDelta(expected, final) {
  if (expected == null || final == null) return null;
  return final - expected;
}
