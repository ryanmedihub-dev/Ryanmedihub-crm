import Badge from "@/components/owner/Badge";
import { rupee, fmtDate, daysAgo } from "@/lib/owner/format";
import { PATIENT_STATUS_LABELS } from "@/lib/owner/patientStatus";

const STATUS_KIND = {
  NEW: "neutral", NOT_VISITED: "warn", NOT_CONVERTED: "bad",
  BOOKING_DONE: "info", SURGERY_BOOKED: "good", CLOSED: "good",
};

export function patientStatusBadge(status) {
  return <Badge kind={STATUS_KIND[status] || "neutral"}>{PATIENT_STATUS_LABELS[status] || status || "—"}</Badge>;
}
export const patientStatusCell = (r) => patientStatusBadge(r.status);

const names = (arr) => (Array.isArray(arr) && arr.length ? arr.map((e) => e?.name).filter(Boolean).join(", ") : "—");

export const PATIENT_SHARED_COLUMNS = [
  { key: "name", label: "Name", sortable: true, render: (r) => r.name || "Unknown" },
  { key: "phone", label: "Phone", render: (r) => r.phone || "—" },
  { key: "branch", label: "Branch", defaultHidden: true, render: (r) => r.branch || "—" },
  { key: "status", label: "Status", render: (r) => patientStatusBadge(r.status) },
  { key: "createdAt", label: "Created", sortable: true, defaultHidden: true, render: (r) => fmtDate(r.createdAt) },
  { key: "visitDate", label: "Visit Date", sortable: true, render: (r) => fmtDate(r.visitDate) },
  { key: "counsellor", label: "Counsellor", defaultHidden: true, render: (r) => r.counsellor?.name || "—" },
  { key: "packageAmount", label: "Package", align: "right", sortable: true, render: (r) => rupee(r.packageAmount) },
  { key: "amountReceived", label: "Received", align: "right", sortable: true, render: (r) => rupee(r.amountReceived) },
  { key: "pendingAmount", label: "Pending", align: "right", sortable: true, render: (r) => rupee(r.pendingAmount) },
  { key: "reference", label: "Assigned Agent", render: (r) => r.reference?.name || "—" },
];

export const DAYS_SINCE_ACTIVITY_COLUMN = {
  key: "daysSinceActivity",
  label: "Days Since Last Activity",
  align: "right",
  sortable: true,
  csv: (r) => daysAgo(r.lastActivityAt) ?? "",
  render: (r) => {
    const d = daysAgo(r.lastActivityAt);
    return d == null ? <span className="muted">—</span> : <Badge kind={d > 14 ? "bad" : "neutral"}>{d}d</Badge>;
  },
};
export const LAST_CONTACT_COLUMN = {
  key: "lastActivityAt",
  label: "Last Contact",
  render: (r) => fmtDate(r.lastActivityAt),
};

export const DAYS_SINCE_BOOKING_COLUMN = {
  key: "daysSinceBooking",
  label: "Days Since Registration",
  align: "right",
  sortable: true,
  csv: (r) => daysAgo(r.createdAt) ?? "",
  render: (r) => {
    const d = daysAgo(r.createdAt);
    if (d == null) return "—";
    
    
    return <Badge kind={d > 10 && !r.surgeryDate ? "bad" : "neutral"}>{d}d</Badge>;
  },
};
export const SURGERY_DATE_IF_SET_COLUMN = {
  key: "surgeryDate",
  label: "Surgery Date",
  render: (r) => (r.surgeryDate ? fmtDate(r.surgeryDate) : <span className="muted">Not booked</span>),
};

export const SURGERY_CLINICAL_COLUMNS = [
  { key: "surgeryDate", label: "Surgery Date", sortable: true, render: (r) => fmtDate(r.surgeryDate) },
  { key: "technique", label: "Technique", render: (r) => r.technique || "—" },
  { key: "graftsneed", label: "Grafts Needed", align: "right", render: (r) => r.graftsneed ?? "—" },
  {
    key: "graftsImplanted",
    label: "Grafts Implanted",
    align: "right",
    render: (r) => (r.graftsImplanted == null ? <Badge kind="warn">Missing</Badge> : r.graftsImplanted),
  },
  { key: "OT", label: "OT", defaultHidden: true, render: (r) => r.OT ?? "—" },
  { key: "doctor", label: "Doctor", render: (r) => names(r.doctor) },
  { key: "seniorTech", label: "Senior Tech", defaultHidden: true, render: (r) => names(r.seniorTech) },
  { key: "implanterRight", label: "Implanter (Right)", defaultHidden: true, render: (r) => names(r.implanterRight) },
  { key: "implanterLeft", label: "Implanter (Left)", defaultHidden: true, render: (r) => names(r.implanterLeft) },
  { key: "graftingPerson", label: "Grafting Person", defaultHidden: true, render: (r) => names(r.graftingPerson) },
  { key: "helper", label: "Helper", defaultHidden: true, render: (r) => names(r.helper) },
  { key: "donorCondition", label: "Donor Condition", defaultHidden: true, render: (r) => r.donorCondition || "—" },
];

export const REVENUE_COLUMNS = [
  { key: "discount", label: "Discount", align: "right", sortable: true, render: (r) => rupee(r.discount) },
];
