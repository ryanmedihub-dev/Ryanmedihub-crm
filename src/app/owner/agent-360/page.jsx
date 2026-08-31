"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import {
  OwnerTopbar, Card, DataTable, Badge, Modal, KpiRow,
  ErrorState, EmptyState, InlineNotice,
} from "@/components/owner";

function fmtSeconds(s) {
  if (!s) return "0m";
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

function fmtDateTime(v) {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

const SORT_ACCESSORS = {
  name: (a) => a.name || "",
  tlName: (a) => a.tlName || "",
  calls: (a) => a.calls?.total || 0,
  connected: (a) => a.calls?.connected || 0,
  connectRate: (a) => a.calls?.connectRate || 0,
  leadsAssigned: (a) => a.leads?.assigned || 0,
  converted: (a) => a.leads?.byStatus?.converted || 0,
};

export default function Agent360Page() {
  const [agents, setAgents]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState("asc");

  const [selected, setSelected]   = useState(null);
  const [detail, setDetail]       = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError]     = useState(null);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/owner/workforce-summary");
      const json = await res.json();
      if (json.success) setAgents(json.agents || []);
      else setError(json.message || "Failed to load");
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sortedRows = useMemo(() => {
    const withId = agents.map((a, i) => ({ ...a, id: a.employeeId || i }));
    const dir = sortDir === "asc" ? 1 : -1;
    const accessor = SORT_ACCESSORS[sortKey] || SORT_ACCESSORS.name;
    return [...withId].sort((a, b) => {
      const av = accessor(a), bv = accessor(b);
      return typeof av === "string" ? dir * av.localeCompare(bv) : dir * (av - bv);
    });
  }, [agents, sortKey, sortDir]);

  const openAgent = async (row) => {
    setSelected(row);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/owner/agent-detail/${row.employeeId}`);
      const json = await res.json();
      if (json.success) setDetail(json);
      else setDetailError(json.message || "Failed to load agent detail");
    } catch {
      setDetailError("Network error — please try again");
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="app">
      <OwnerSidebar />

      <div className="main">
        <OwnerTopbar
          title="Agent 360°"
          subtitle="Sortable performance table — click a row for full detail"
          controls={
            <button className="icon-btn" onClick={fetchAgents} disabled={loading} title="Refresh">
              {loading ? "…" : "⟳"}
            </button>
          }
        />

        <div className="content">
          {error ? (
            <ErrorState message={error} onRetry={fetchAgents} />
          ) : (
            <>
              <KpiRow
                primaryIndex={3}
                loading={loading}
                items={[
                  { label: "Total Agents", value: loading ? "—" : agents.length, sub: "In roster", kind: "info" },
                  { label: "Active", value: loading ? "—" : agents.filter((a) => a.isActive).length, sub: "Currently active", kind: "good" },
                  { label: "Total Calls", value: loading ? "—" : agents.reduce((s, a) => s + (a.calls?.total || 0), 0), sub: "This range", kind: "info" },
                  {
                    label: "Blended Connect Rate",
                    value: loading ? "—" : (() => {
                      const total = agents.reduce((s, a) => s + (a.calls?.total || 0), 0);
                      const connected = agents.reduce((s, a) => s + (a.calls?.connected || 0), 0);
                      return total > 0 ? `${Math.round((connected / total) * 100)}%` : "—";
                    })(),
                    sub: "Calls connected",
                    kind: "good",
                  },
                  { label: "Leads Assigned", value: loading ? "—" : agents.reduce((s, a) => s + (a.leads?.assigned || 0), 0), sub: "Present snapshot", kind: "info" },
                  { label: "Converted", value: loading ? "—" : agents.reduce((s, a) => s + (a.leads?.byStatus?.converted || 0), 0), sub: "Total", kind: "good" },
                ]}
              />
              <Card title="Agents" subtitle={loading ? "Loading…" : `${agents.length} agents · click a row for full detail`}>
              <DataTable
                tall
                loading={loading}
                emptyMessage={<EmptyState icon="☏" title="No agent data" hint="The workforce summary is empty for this range." />}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                onRowClick={openAgent}
                columns={[
                  { key: "name", label: "Agent", sortable: true },
                  { key: "tlName", label: "Team", sortable: true, render: (a) => a.tlName || "Unassigned" },
                  { key: "isActive", label: "Status", render: (a) => <Badge kind={a.isActive ? "good" : "neutral"} glyph>{a.isActive ? "Active" : "Inactive"}</Badge> },
                  { key: "calls", label: "Calls", sortable: true, align: "right", render: (a) => a.calls?.total ?? "—" },
                  { key: "connected", label: "Connected", sortable: true, align: "right", render: (a) => a.calls?.connected ?? "—" },
                  { key: "connectRate", label: "Connect Rate", sortable: true, align: "right", render: (a) => a.calls ? `${Math.round((a.calls.connectRate || 0) * 100)}%` : "—" },
                  { key: "leadsAssigned", label: "Leads Assigned", sortable: true, align: "right", render: (a) => a.leads?.assigned ?? "—" },
                  { key: "converted", label: "Converted", sortable: true, align: "right", render: (a) => a.leads?.byStatus?.converted ?? "—" },
                ]}
                rows={loading ? [] : sortedRows}
              />
              </Card>
            </>
          )}
        </div>
      </div>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name || "Agent Detail"}
        subtitle={selected?.tlName ? `Team: ${selected.tlName}` : "Unassigned team"}
      >
        {detailLoading ? (
          <p className="muted">Loading…</p>
        ) : detailError ? (
          <InlineNotice kind="error" title="Couldn't load this agent's detail">{detailError}</InlineNotice>
        ) : detail ? (
          <>
            <div className="metric-row">
              <span>Daily Target</span>
              <div />
              <strong>{detail.employee?.dailyTarget ?? "—"}</strong>
            </div>
            <div className="metric-row">
              <span>Total Calls</span>
              <div />
              <strong>{detail.calls?.total ?? "—"}</strong>
            </div>
            <div className="metric-row">
              <span>Connected / Connect Rate</span>
              <div />
              <strong>{detail.calls?.connected ?? 0} · {Math.round((detail.calls?.connectRate || 0) * 100)}%</strong>
            </div>
            <div className="metric-row">
              <span>Outgoing / Incoming / Missed / Rejected</span>
              <div />
              <strong>{detail.calls?.outgoing ?? 0} / {detail.calls?.incoming ?? 0} / {detail.calls?.missed ?? 0} / {detail.calls?.rejected ?? 0}</strong>
            </div>
            <div className="metric-row">
              <span>Total Talk Time</span>
              <div />
              <strong>{fmtSeconds(detail.calls?.totalDurationSeconds)}</strong>
            </div>
            <div className="metric-row">
              <span>Leads Assigned</span>
              <div />
              <strong>{detail.leads?.assigned ?? "—"}</strong>
            </div>

            <div style={{ marginTop: 14 }}>
              <p className="muted" style={{ marginBottom: 6 }}>Leads by Status</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {Object.entries(detail.leads?.byStatus || {}).map(([status, count]) => (
                  <Badge key={status} kind="neutral">{status}: {count}</Badge>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <p className="muted" style={{ marginBottom: 6 }}>Recent Calls</p>
              <DataTable
                emptyMessage="No recent calls"
                columns={[
                  { key: "contactName", label: "Contact" },
                  { key: "contactNumber", label: "Number" },
                  { key: "callType", label: "Type" },
                  { key: "duration", label: "Duration", render: (r) => fmtSeconds(r.duration) },
                  { key: "timestamp", label: "When", render: (r) => fmtDateTime(r.timestamp) },
                ]}
                rows={(detail.recentCalls || []).map((c, i) => ({ ...c, id: i }))}
              />
            </div>

            <div style={{ marginTop: 14 }}>
              <p className="muted" style={{ marginBottom: 6 }}>Recent Lead Activity</p>
              <DataTable
                emptyMessage="No recent lead activity"
                columns={[
                  { key: "leadName", label: "Lead" },
                  { key: "action", label: "Action" },
                  { key: "changedAt", label: "When", render: (r) => fmtDateTime(r.changedAt) },
                ]}
                rows={(detail.recentLeadChangelog || []).map((c, i) => ({ ...c, id: i }))}
              />
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  );
}
