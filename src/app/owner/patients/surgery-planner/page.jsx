"use client";

import { useEffect, useState, useCallback } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, DataTable, Badge, KpiRow, ErrorState, EmptyState, Skeleton } from "@/components/owner";
import { ownerFetch } from "@/lib/ownerFetch";
import { fmtDate, num } from "@/lib/owner/format";
import { OWNER_BRANCHES as BRANCHES, FORWARD_DATE_RANGES as DATE_RANGES, buildForwardDateRange as buildDateRange } from "@/lib/owner/filters";

export default function SurgeryPlannerPage() {
  const [branch, setBranch]       = useState("All");
  const [dateRange, setDateRange] = useState("Next 7 Days");
  const [custom, setCustom]       = useState({ from: "", to: "" });

  const [surgeries, setSurgeries] = useState([]);
  const [capacity, setCapacity]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  const fetchData = useCallback(async ({ signal } = {}) => {
    if (dateRange === "Custom" && !custom.from) return;
    setLoading(true);
    setError(null);
    const { from, to } = buildDateRange(dateRange, custom);
    const r = await ownerFetch("/api/owner/surgery-planner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branch, from, to }),
      signal,
    });
    if (r.aborted) return;
    if (r.ok) {
      setSurgeries(r.data?.surgeries || []);
      setCapacity(r.data?.todayOTCapacity || []);
    } else {
      setError(r.error);
    }
    setLoading(false);
  }, [branch, dateRange, custom]);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchData({ signal: ctrl.signal });
    return () => ctrl.abort();
  }, [fetchData]);

  const todayOTLoad = capacity.reduce((s, c) => s + (c.count || 0), 0);
  const graftsPlanned = surgeries.reduce((s, r) => s + (Number(r.graftsneed) || 0), 0);
  const techniqueMix = new Set(surgeries.map((r) => r.technique).filter(Boolean)).size;

  const kpiItems = [
    { label: "Scheduled surgeries", value: loading ? "—" : surgeries.length, sub: dateRange, kind: "info" },
    { label: "Today's OT load", value: loading ? "—" : todayOTLoad, sub: `${capacity.length} OT${capacity.length === 1 ? "" : "s"} in use`, kind: todayOTLoad > 0 ? "warn" : "good" },
    { label: "Grafts planned", value: loading ? "—" : num(graftsPlanned), sub: "Across the window", kind: "info" },
    { label: "Technique mix", value: loading ? "—" : techniqueMix, sub: "Distinct techniques", kind: "info" },
  ];

  return (
    <div className="app">
      <OwnerSidebar />

      <div className="main">
        <OwnerTopbar
          title="Surgery & OT Planner"
          subtitle="Scheduled surgeries and today's real OT load"
          controls={
            <>
              <select className="control" value={branch} onChange={(e) => setBranch(e.target.value)}>
                {BRANCHES.map((b) => <option key={b}>{b}</option>)}
              </select>
              <select className="control" value={dateRange} onChange={(e) => setDateRange(e.target.value)}>
                {DATE_RANGES.map((r) => <option key={r}>{r}</option>)}
              </select>
              {dateRange === "Custom" && (
                <>
                  <input type="date" className="control" value={custom.from} onChange={(e) => setCustom((p) => ({ ...p, from: e.target.value }))} />
                  <input type="date" className="control" value={custom.to} onChange={(e) => setCustom((p) => ({ ...p, to: e.target.value }))} />
                </>
              )}
              <button className="icon-btn" onClick={fetchData} disabled={loading} title="Refresh">
                {loading ? "…" : "⟳"}
              </button>
            </>
          }
        />

        <div className="content">
          {error ? (
            <ErrorState message={error} onRetry={fetchData} />
          ) : (
            <>
              <KpiRow items={kpiItems} primaryIndex={0} loading={loading} />

              <Card title="Today's OT capacity" subtitle="Real count of surgeries scheduled today, by OT — not a fabricated utilization %">
                {loading ? (
                  <Skeleton variant="row" count={3} style={{ height: 56, margin: "8px 0" }} />
                ) : capacity.length === 0 ? (
                  <EmptyState icon="✂" title="No surgeries scheduled today" hint="Today's OT board is clear." />
                ) : (
                  <div className="status-grid">
                    {capacity.map((c) => (
                      <div className="status-card" key={c.OT}>
                        <strong>{c.count}</strong>
                        <span>OT {c.OT}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card
                title="Scheduled surgeries"
                subtitle={loading ? "Loading…" : `${surgeries.length} surgeries · ${dateRange}${branch !== "All" ? ` · ${branch}` : ""}`}
              >
                <DataTable
                  tall
                  loading={loading}
                  emptyMessage={<EmptyState icon="✂" title="No surgeries in this window" hint="Pick a wider date range or another branch." />}
                  columns={[
                    { key: "name", label: "Patient" },
                    { key: "branch", label: "Branch" },
                    { key: "surgeryDate", label: "Date", render: (r) => fmtDate(r.surgeryDate) },
                    { key: "OT", label: "OT", render: (r) => (r.OT != null ? <Badge kind="info">OT {r.OT}</Badge> : "—") },
                    { key: "technique", label: "Technique" },
                    { key: "graftsneed", label: "Grafts needed", align: "right" },
                    { key: "graftsImplanted", label: "Grafts implanted", align: "right" },
                    { key: "doctor", label: "Doctor" },
                    { key: "seniorTech", label: "Senior tech" },
                    { key: "implanterRight", label: "Implanter R" },
                    { key: "implanterLeft", label: "Implanter L" },
                  ]}
                  rows={loading ? [] : surgeries.map((r, i) => ({ ...r, id: r.id || r._id || i }))}
                />
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
