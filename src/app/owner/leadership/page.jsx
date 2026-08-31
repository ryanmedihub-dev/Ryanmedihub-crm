"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, DataTable, Heatmap, KpiRow, ErrorState, EmptyState } from "@/components/owner";

const METRICS = [
  { key: "leadsAssigned", label: "Leads" },
  { key: "totalCalls", label: "Calls" },
  { key: "connectRate", label: "Connect Rate" },
  { key: "converted", label: "Converted" },
];

function normalizeColumn(rows, key) {
  const values = rows.map((r) => r[key]).filter((v) => v != null);
  if (values.length === 0) return rows.map(() => null);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return rows.map((r) => (r[key] == null ? null : Math.round(((r[key] - min) / range) * 100)));
}

export default function LeadershipPage() {
  const [tlRows, setTlRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/owner/leadership");
      const json = await res.json();
      if (json.success) setTlRows(json.tlRows || []);
      else setError(json.message || "Failed to load");
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const heatmapData = useMemo(() => {
    const columns = METRICS.map((m) => normalizeColumn(tlRows, m.key));
    return tlRows.map((_, ri) => columns.map((col) => col[ri]));
  }, [tlRows]);

  return (
    <div className="app">
      <OwnerSidebar />

      <div className="main">
        <OwnerTopbar
          title="TL & Manager"
          subtitle="Team-lead ranking from callby's teamTotals — no manager tier in this data model"
          controls={
            <button className="icon-btn" onClick={fetchData} disabled={loading} title="Refresh">
              {loading ? "…" : "⟳"}
            </button>
          }
        />

        <div className="content">
          {error ? (
            <ErrorState message={error} onRetry={fetchData} />
          ) : (
            <>
              <KpiRow
                primaryIndex={4}
                loading={loading}
                items={[
                  { label: "Team Leads", value: loading ? "—" : tlRows.length, sub: "Active teams", kind: "info" },
                  { label: "Total Agents", value: loading ? "—" : tlRows.reduce((s, r) => s + (r.agentCount || 0), 0), sub: "Across all TLs", kind: "info" },
                  { label: "Total Leads", value: loading ? "—" : tlRows.reduce((s, r) => s + (r.leadsAssigned || 0), 0), sub: "Assigned", kind: "info" },
                  { label: "Total Calls", value: loading ? "—" : tlRows.reduce((s, r) => s + (r.totalCalls || 0), 0), sub: "This range", kind: "info" },
                  { label: "Total Converted", value: loading ? "—" : tlRows.reduce((s, r) => s + (r.converted || 0), 0), sub: "All teams", kind: "good" },
                  { label: "Top Team", value: loading || tlRows.length === 0 ? "—" : tlRows[0].tlName, sub: "By connect rate", kind: "good" },
                ]}
              />
              <Card title="TL Ranking" subtitle={loading ? "Loading…" : `${tlRows.length} team leads`}>
                <DataTable
                  loading={loading}
                  emptyMessage={<EmptyState icon="⌘" title="No team data" hint="Team-lead totals come from callby's teamTotals once teams are configured." />}
                  columns={[
                    { key: "tlName", label: "Team Lead" },
                    { key: "agentCount", label: "Agents", align: "right", render: (r) => r.agentCount ?? "—" },
                    { key: "leadsAssigned", label: "Leads", align: "right", render: (r) => r.leadsAssigned ?? "—" },
                    { key: "totalCalls", label: "Calls", align: "right", render: (r) => r.totalCalls ?? "—" },
                    { key: "connectRate", label: "Connect Rate", align: "right", render: (r) => (r.connectRate != null ? `${r.connectRate}%` : "—") },
                    { key: "converted", label: "Converted", align: "right", render: (r) => r.converted ?? "—" },
                  ]}
                  rows={loading ? [] : tlRows.map((r, i) => ({ ...r, id: r.tlName || i }))}
                />
              </Card>

              {!loading && tlRows.length > 0 && (
                <Card title="Relative Performance" subtitle="Each metric normalized 0–100 across TLs — not an absolute score">
                  <Heatmap
                    rows={tlRows.map((r) => r.tlName)}
                    cols={METRICS.map((m) => m.label)}
                    data={heatmapData}
                    formatValue={(v) => v}
                  />
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
