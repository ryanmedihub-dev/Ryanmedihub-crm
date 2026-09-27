import Badge from "@/components/owner/Badge";
import { fmtDate, fmtTime, fmtDurationShort } from "@/lib/owner/format";

const CALL_TYPE_KIND = { incoming: "good", outgoing: "info", missed: "bad", rejected: "neutral" };

export function callTypeBadge(type) {
  return <Badge kind={CALL_TYPE_KIND[type] || "neutral"}>{type || "—"}</Badge>;
}

export const CALL_REPORT_COLUMNS = [
  {
    key: "employeeName",
    label: "Employee",
    sortable: true,
    render: (r) => (
      <span>
        {r.employeeName || "Unknown"}
        {r.employeeTL && <span className="muted" style={{ display: "block", fontSize: "var(--fs-12)" }}>TL: {r.employeeTL}</span>}
      </span>
    ),
  },
  { key: "contactNumber", label: "To Number", render: (r) => r.contactNumber || "—" },
  { key: "contactName", label: "Contact Name", render: (r) => r.contactName || "Unknown" },
  {
    key: "source",
    label: "Source",
    defaultHidden: true,
    render: (r) => (r.source ? <Badge kind="info">{r.source}</Badge> : <span className="muted">—</span>),
  },
  {
    key: "contactType",
    label: "Contact Type",
    defaultHidden: true,
    render: (r) => <Badge kind={r.contactType === "New" ? "good" : "neutral"}>{r.contactType || "—"}</Badge>,
  },
  { key: "timestamp", label: "Date", sortable: true, render: (r) => fmtDate(r.timestamp) },
  { key: "time", label: "Time", defaultHidden: true, render: (r) => fmtTime(r.timestamp) },
  { key: "duration", label: "Duration", align: "right", sortable: true, render: (r) => fmtDurationShort(r.duration) },
  { key: "callType", label: "Call Type", render: (r) => callTypeBadge(r.callType) },
  { key: "callStatus", label: "Call Status", defaultHidden: true, render: (r) => r.callStatus || "—" },
  {
    key: "leadName",
    label: "Linked Lead",
    defaultHidden: true,
    render: (r) => (r.leadName ? `${r.leadName} (${r.leadStatus || "—"})` : <span className="muted">Not linked</span>),
  },
  { key: "notes", label: "Remarks", defaultHidden: true, render: (r) => r.notes || "—" },
];
