"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import {
  OwnerTopbar, Card, DataTable, Badge, KpiRow,
  DrillSeam, InlineNotice, ErrorState, EmptyState, AttentionRamp, priorityToLevel,
} from "@/components/owner";

const LANES = [
  { key: "P0", label: "P0 · Interested, overdue follow-up" },
  { key: "P1", label: "P1 · Recently connected" },
  { key: "P2", label: "P2 · New, untouched" },
  { key: "P3", label: "P3 · Not connected, due" },
  { key: "P4", label: "P4 · Still open" },
];

const STATUS_KIND = {
  interested: "good",
  contacted: "info",
  new: "neutral",
  not_connected: "warn",
};

function fmtDateTime(v) {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

const RETRY_SORT = {
  priority: (r) => r.priority || "",
  name: (r) => r.name || "",
  attempts: (r) => r.attempts || 0,
  ageHours: (r) => r.ageHours || 0,
};

export default function LiveWorkforcePage() {
  const [agents, setAgents]           = useState([]);
  const [agentsError, setAgentsError] = useState(null);
  const [queue, setQueue]             = useState({ P0: [], P1: [], P2: [], P3: [], P4: [] });
  const [queueError, setQueueError]   = useState(null);
  const [loading, setLoading]         = useState(true);
  const [fatalError, setFatalError]   = useState(null);

  // retry queue — folded in from the former /owner/retry screen
  const [retryItems, setRetryItems]   = useState([]);
  const [retryLoading, setRetryLoading] = useState(true);
  const [retryError, setRetryError]   = useState(null);

  const [seamLane, setSeamLane] = useState(null); // "P0".."P4" | "ALL" | null
  const [sortKey, setSortKey]   = useState("priority");
  const [sortDir, setSortDir]   = useState("asc");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFatalError(null);
    try {
      const res = await fetch("/api/owner/live-workforce");
      const json = await res.json();
      if (json.success) {
        setAgents(json.agents || []);
        setAgentsError(json.agentsError);
        setQueue(json.queue || { P0: [], P1: [], P2: [], P3: [], P4: [] });
        setQueueError(json.queueError);
      } else {
        setFatalError(json.message || "Failed to load");
      }
    } catch {
      setFatalError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRetry = useCallback(async () => {
    setRetryLoading(true);
    setRetryError(null);
    try {
      const res = await fetch("/api/owner/retry-queue");
      const json = await res.json();
      if (json.success) setRetryItems(json.leads || []);
      else setRetryError(json.message || "Failed to load the retry queue");
    } catch {
      setRetryError("Network error while loading the retry queue");
    } finally {
      setRetryLoading(false);
    }
  }, []);

  const refresh = useCallback(() => { fetchData(); fetchRetry(); }, [fetchData, fetchRetry]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const totalCalls     = agents.reduce((s, a) => s + (a.calls?.total || 0), 0);
  const totalConnected = agents.reduce((s, a) => s + (a.calls?.connected || 0), 0);
  const totalQueued    = Object.values(queue).reduce((s, l) => s + l.length, 0);

  const seamRows = useMemo(() => {
    let rows = seamLane && seamLane !== "ALL"
      ? retryItems.filter((r) => r.priority === seamLane)
      : retryItems;
    const dir = sortDir === "asc" ? 1 : -1;
    const acc = RETRY_SORT[sortKey] || RETRY_SORT.priority;
    return [...rows]
      .sort((a, b) => {
        const av = acc(a), bv = acc(b);
        return typeof av === "string" ? dir * av.localeCompare(bv) : dir * (av - bv);
      })
      .map((r, i) => ({ ...r, id: r.id || i }));
  }, [retryItems, seamLane, sortKey, sortDir]);

  const kpiItems = [
    { label: "Total Agents", value: loading ? "—" : agents.length, sub: "In roster", kind: "info" },
    { label: "Active", value: loading ? "—" : agents.filter((a) => a.isActive).length, sub: "Currently active", kind: "good" },
    { label: "Total Calls", value: loading ? "—" : totalCalls, sub: "This range", kind: "info" },
    {
      label: "Blended Connect Rate",
      value: loading ? "—" : totalCalls > 0 ? `${Math.round((totalConnected / totalCalls) * 100)}%` : "—",
      sub: "Calls connected",
      kind: "good",
    },
    {
      label: "P0 Queue",
      value: loading ? "—" : (queue.P0 || []).length,
      sub: "Overdue follow-up",
      kind: "bad",
      onDrill: () => setSeamLane((s) => (s === "P0" ? null : "P0")),
      drillOpen: seamLane === "P0",
    },
    {
      label: "Total Queued",
      value: loading ? "—" : totalQueued,
      sub: "P0–P4 · tap for full list",
      kind: "warn",
      onDrill: () => setSeamLane((s) => (s === "ALL" ? null : "ALL")),
      drillOpen: seamLane === "ALL",
    },
  ];

  return (
    <div className="app">
      <OwnerSidebar />

      <div className="main">
        <OwnerTopbar
          title="Live Workforce & Queue"
          subtitle="Per-agent status and the P0–P4 retry queue, live from callby"
          controls={
            <button className="icon-btn" onClick={refresh} disabled={loading} title="Refresh">
              {loading ? "…" : "⟳"}
            </button>
          }
        />

        <div className="content">
          {fatalError ? (
            <ErrorState message={fatalError} onRetry={refresh} />
          ) : (
            <>
              <KpiRow items={kpiItems} primaryIndex={4} loading={loading} />

              <DrillSeam
                open={!!seamLane}
                onClose={() => setSeamLane(null)}
                title={seamLane === "ALL" ? "Full retry queue" : `${seamLane} retry lane`}
                subtitle={
                  retryError
                    ? "Retry queue unavailable"
                    : `${seamRows.length} lead${seamRows.length === 1 ? "" : "s"} · sortable`
                }
              >
                {retryError ? (
                  <InlineNotice kind="error" title="Couldn't load the retry queue">{retryError}</InlineNotice>
                ) : (
                  <DataTable
                    tall
                    loading={retryLoading}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                    emptyMessage={<EmptyState icon="✓" title="This lane is clear" hint="No leads currently due a follow-up here." />}
                    columns={[
                      { key: "priority", label: "Priority", sortable: true, render: (r) => <Badge kind={r.priority === "P0" ? "bad" : r.priority === "P1" ? "warn" : "neutral"} glyph>{r.priority}</Badge> },
                      { key: "name", label: "Lead", sortable: true, render: (r) => r.name || "Unknown" },
                      { key: "phone", label: "Phone", render: (r) => r.phone || "—" },
                      { key: "status", label: "Status", render: (r) => (r.status ? <Badge kind={STATUS_KIND[r.status] || "neutral"}>{r.status}</Badge> : "—") },
                      { key: "attempts", label: "Attempts", sortable: true, align: "right", render: (r) => r.attempts ?? "—" },
                      { key: "ageHours", label: "Age", sortable: true, align: "right", render: (r) => `${Math.round(r.ageHours || 0)}h` },
                      { key: "lastCallAt", label: "Last Call", render: (r) => fmtDateTime(r.lastCallAt) },
                      { key: "followUpDate", label: "Follow-up Due", render: (r) => fmtDateTime(r.followUpDate) },
                      { key: "agent", label: "Agent", render: (r) => r.assignedTo?.name || "Unassigned" },
                    ]}
                    rows={seamRows}
                  />
                )}
              </DrillSeam>

              <Card title="Live Priority Lanes" subtitle="P0 (most urgent) through P4 — tap a count for the full sortable list">
                {queueError && (
                  <InlineNotice kind="error" title="Couldn't load the priority lanes">{queueError}</InlineNotice>
                )}
                <div className="queue-lane">
                  {LANES.map((lane) => {
                    const items = queue[lane.key] || [];
                    return (
                      <div className="lane" key={lane.key}>
                        <div className="lane-head">
                          <strong>{lane.label}</strong>
                          <button
                            type="button"
                            className="lane-count"
                            onClick={() => setSeamLane((s) => (s === lane.key ? null : lane.key))}
                            aria-expanded={seamLane === lane.key}
                            title="Open the full list for this lane"
                          >
                            {items.length}
                          </button>
                        </div>
                        <AttentionRamp level={priorityToLevel(lane.key)} label={lane.key === "P0" ? "Most urgent" : lane.key === "P1" ? "High" : "Watch"} />
                        {loading ? (
                          <p className="muted">Loading…</p>
                        ) : items.length === 0 ? (
                          <p className="muted">Empty</p>
                        ) : (
                          items.slice(0, 25).map((item, i) => (
                            <div className="queue-card" key={item.id || i}>
                              <strong>{item.name || "Unknown"}</strong>
                              <p>{item.phone || ""} · {Math.round(item.ageHours || 0)}h old</p>
                              <div className="row">
                                <Badge kind={STATUS_KIND[item.status] || "neutral"}>{item.status || "—"}</Badge>
                                <span className="muted">{item.assignedTo?.name || "Unassigned"}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card title="Agent Status" subtitle={loading ? "Loading…" : `${agents.length} agents`}>
                {agentsError && (
                  <InlineNotice kind="error" title="Couldn't load agent status">{agentsError}</InlineNotice>
                )}
                <DataTable
                  tall
                  loading={loading}
                  emptyMessage={<EmptyState icon="☏" title="No agent data" hint="Agent status arrives from callby once agents start dialling." />}
                  columns={[
                    { key: "name", label: "Agent" },
                    { key: "tlName", label: "Team", render: (a) => a.tlName || "Unassigned" },
                    {
                      key: "isActive",
                      label: "Status",
                      render: (a) => <Badge kind={a.isActive ? "good" : "neutral"} glyph>{a.isActive ? "Active" : "Inactive"}</Badge>,
                    },
                    { key: "calls", label: "Calls", align: "right", render: (a) => a.calls?.total ?? "—" },
                    { key: "connected", label: "Connected", align: "right", render: (a) => a.calls?.connected ?? "—" },
                    { key: "connectRate", label: "Connect Rate", align: "right", render: (a) => a.calls ? `${Math.round((a.calls.connectRate || 0) * 100)}%` : "—" },
                    { key: "leadsAssigned", label: "Leads Assigned", align: "right", render: (a) => a.leads?.assigned ?? "—" },
                  ]}
                  rows={loading ? [] : agents.map((a, i) => ({ ...a, id: a.employeeId || i }))}
                />
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
