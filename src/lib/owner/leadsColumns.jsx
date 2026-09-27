import Badge from "@/components/owner/Badge";
import { fmtDate, fmtDateTime, daysAgo } from "@/lib/owner/format";

const STATUS_KIND = {
  new: "neutral", contacted: "info", not_connected: "warn", interested: "good",
  not_interested: "bad", follow_up: "info", booking_done: "good", converted: "good", lost: "bad",
};

export function leadStatusBadge(status) {
  return <Badge kind={STATUS_KIND[status] || "neutral"}>{status || "—"}</Badge>;
}

export const LEAD_BASE_COLUMNS = [
  { key: "name", label: "Name", sortable: true, render: (r) => r.name || "Unknown" },
  { key: "phone", label: "Phone", render: (r) => r.phone || "—" },
  { key: "status", label: "Status", render: (r) => leadStatusBadge(r.status) },
  { key: "source", label: "Source", defaultHidden: true, render: (r) => r.source || "—" },
  {
    key: "assignedTo",
    label: "Assigned Agent",
    render: (r) => (
      <span>
        {r.assignedTo?.name || <span className="muted">Unassigned</span>}
        {r.assignedTo?.tlName && <span className="muted" style={{ display: "block", fontSize: "var(--fs-12)" }}>TL: {r.assignedTo.tlName}</span>}
      </span>
    ),
  },
  { key: "attempts", label: "Attempts", align: "right", sortable: true, render: (r) => r.attempts ?? 0 },
  { key: "connectedCallCount", label: "Connected Calls", align: "right", defaultHidden: true, render: (r) => r.connectedCallCount ?? 0 },
  { key: "lastCallAt", label: "Last Call At", sortable: true, render: (r) => fmtDateTime(r.lastCallAt) },
  { key: "followUpDate", label: "Follow-up Date", defaultHidden: true, render: (r) => fmtDate(r.followUpDate) },
  {
    key: "createdAt",
    label: "Age",
    align: "right",
    sortable: true,
    render: (r) => {
      const d = daysAgo(r.createdAt);
      return d == null ? "—" : `${d}d`;
    },
  },
];

export const DAYS_SINCE_LAST_CALL_COLUMN = {
  key: "daysSinceLastCall",
  label: "Days Since Last Call",
  align: "right",
  sortable: true,
  render: (r) => {
    const d = daysAgo(r.lastCallAt);
    if (d == null) return <Badge kind="warn">Never called</Badge>;
    return <Badge kind={d > 2 ? "bad" : "neutral"}>{d}d</Badge>;
  },
};

export const OVERDUE_BY_COLUMN = {
  key: "overdueBy",
  label: "Overdue By",
  align: "right",
  sortable: true,
  render: (r) => {
    if (!r.followUpDate) return "—";
    const d = daysAgo(r.followUpDate);
    if (d == null || d <= 0) return <span className="muted">Not yet due</span>;
    return <Badge kind="bad">{d}d overdue</Badge>;
  },
};

export const LAST_NOTE_COLUMN = {
  key: "lastCallNote",
  label: "Last Note",
  render: (r) => r.lastCallNote || r.lastCallSummary || <span className="muted">—</span>,
};

export const POOL_STATE_COLUMN = {
  key: "poolState",
  label: "Pool State",
  render: (r) =>
    r.assignedTo
      ? <Badge kind="info">Assigned, never called</Badge>
      : <Badge kind="warn">In pool{r.pooledAt ? ` since ${fmtDate(r.pooledAt)}` : ""}</Badge>,
};
