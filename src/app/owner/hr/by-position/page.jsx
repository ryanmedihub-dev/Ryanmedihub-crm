"use client";

import { useCallback, useEffect, useState } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, FilterBar, DataTable, ErrorState } from "@/components/owner";
import { ownerFetch } from "@/lib/ownerFetch";
import { rupee, num } from "@/lib/owner/format";

export default function HrByPositionPage() {
  const [filterState, setFilterState] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortKey, setSortKey] = useState("interviews");
  const [sortDir, setSortDir] = useState("desc");

  const load = useCallback(
    async ({ signal } = {}) => {
      if (!filterState) return;
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.set("dateFrom", filterState.range.from);
      params.set("dateTo", filterState.range.to);
      const r = await ownerFetch(`/api/owner/hr/by-position?${params.toString()}`, { signal });
      if (r.aborted) return;
      if (r.ok) setRows(r.data?.rows || []);
      else setError(r.error);
      setLoading(false);
    },
    [filterState],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load({ signal: ctrl.signal });
    return () => ctrl.abort();
  }, [load]);

  const handleSort = (key) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = [...rows].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    const av = a[sortKey], bv = b[sortKey];
    if (typeof av === "string") return dir * av.localeCompare(bv || "");
    return dir * ((av ?? -1) - (bv ?? -1));
  });

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar
          title="By Position"
          subtitle="Which roles are hard to hire — selection rate, salary gap, time to fill"
          controls={
            <button className="icon-btn" onClick={() => load()} disabled={loading} title="Refresh">
              {loading ? "…" : "⟳"}
            </button>
          }
        />

        <div className="content">
          <FilterBar show={["date"]} onChange={({ filters, range }) => setFilterState({ filters, range })} />

          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <Card title="Positions" subtitle={loading ? "Loading…" : `${rows.length} positions`}>
              <DataTable
                tall
                loading={loading}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                emptyMessage="No interviews in this range."
                columns={[
                  { key: "position", label: "Position", sortable: true },
                  { key: "interviews", label: "Interviews", align: "right", sortable: true, render: (r) => num(r.interviews) },
                  { key: "selected", label: "Selected", align: "right", sortable: true, render: (r) => num(r.selected) },
                  { key: "rejected", label: "Rejected", align: "right", sortable: true, render: (r) => num(r.rejected) },
                  { key: "onHold", label: "On Hold", align: "right", sortable: true, render: (r) => num(r.onHold) },
                  { key: "selectionRate", label: "Selection Rate", align: "right", sortable: true, render: (r) => `${r.selectionRate}%` },
                  { key: "avgExpectedSalary", label: "Avg. Expected Salary", align: "right", sortable: true, render: (r) => rupee(r.avgExpectedSalary) },
                  { key: "avgFinalSalary", label: "Avg. Final Salary", align: "right", sortable: true, render: (r) => rupee(r.avgFinalSalary) },
                  { key: "avgDaysToFill", label: "Avg. Days to Fill", align: "right", sortable: true, render: (r) => (r.avgDaysToFill == null ? "—" : `${r.avgDaysToFill}d`) },
                ]}
                rows={sorted.map((r) => ({ ...r, id: r.position }))}
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
