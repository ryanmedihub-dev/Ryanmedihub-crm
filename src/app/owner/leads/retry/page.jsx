"use client";

import { useState, useMemo } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import {
  OwnerTopbar, Card, DataTable, Badge, KpiRow,
  DrillSeam, InlineNotice, ErrorState, EmptyState, AttentionRamp, priorityToLevel,
} from "@/components/owner";
import { AiBriefPanel } from "@/components/owner/ai";
import { useAiInsight } from "@/lib/ai/client/useAiInsight";
import { useOwnerData } from "@/lib/owner/useOwnerData";
import { fmtDateTime } from "@/lib/owner/format";

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

const RETRY_SORT = {
  priority: (r) => r.priority || "",
  name: (r) => r.name || "",
  attempts: (r) => r.attempts || 0,
  ageHours: (r) => r.ageHours || 0,
};

export default function RetryQueuePage() {
  const [seamLane, setSeamLane] = useState(null); 
  const [sortKey, setSortKey] = useState("priority");
  const [sortDir, setSortDir] = useState("asc");

  const { data, loading, error, mutate: refresh } = useOwnerData("/api/owner/leads/retry");
  const retryAi = useAiInsight("leads.retry", {}, { kind: "brief" });
  const queue = data?.queue || { P0: [], P1: [], P2: [], P3: [], P4: [] };
  const byPriority = data?.byPriority || {};
  const truncated = !!data?.truncated;

  const retryItems = useMemo(() => Object.values(queue).flat(), [queue]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const totalQueued = Object.values(queue).reduce((s, l) => s + l.length, 0);

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
    { label: "Total Queued", value: loading ? "—" : totalQueued, sub: truncated ? "Showing a capped page" : "P0–P4", kind: "warn" },
    { label: "P0 · Most Urgent", value: loading ? "—" : (queue.P0 || []).length, sub: "Overdue follow-up", kind: "bad" },
    { label: "P1 · Recently Connected", value: loading ? "—" : (queue.P1 || []).length, sub: "Callback window", kind: "info" },
    { label: "Matching (all priorities)", value: loading ? "—" : (byPriority.P0 ?? 0) + (byPriority.P1 ?? 0) + (byPriority.P2 ?? 0) + (byPriority.P3 ?? 0) + (byPriority.P4 ?? 0), sub: "Before capping to a page", kind: "info" },
  ];

  return (
    <div className="app">
      <OwnerSidebar />

      <div className="main">
        <OwnerTopbar
          title="Retry & Recovery"
          subtitle="Prioritized P0–P4 retry queue, live from callby"
          aiState={retryAi}
          controls={
            <button className="icon-btn" onClick={() => refresh()} disabled={loading} title="Refresh">
              {loading ? "…" : "⟳"}
            </button>
          }
        />

        <div className="content">
          <AiBriefPanel feature="leads.retry" scope={{}} title="Retry & Recovery" aiState={retryAi} />

          {error ? (
            <ErrorState message={error} onRetry={refresh} />
          ) : (
            <>
              <KpiRow items={kpiItems} primaryIndex={0} loading={loading} />

              <DrillSeam
                open={!!seamLane}
                onClose={() => setSeamLane(null)}
                title={seamLane === "ALL" ? "Full retry queue" : `${seamLane} retry lane`}
                subtitle={`${seamRows.length} lead${seamRows.length === 1 ? "" : "s"} · sortable`}
              >
                <DataTable
                  tall
                  loading={loading}
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
              </DrillSeam>

              {truncated && (
                <InlineNotice kind="info" title="Showing a capped page">
                  More leads match than are shown — the queue caps the response so it stays fast.
                </InlineNotice>
              )}

              <Card title="Retry Priority Lanes" subtitle="P0 (most urgent) through P4 — tap a count for the full sortable list">
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
