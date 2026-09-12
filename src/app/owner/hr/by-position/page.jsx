"use client";

import { useCallback, useEffect, useState } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, FilterBar, ReportTable, KpiRow, ErrorState } from "@/components/owner";
import { ownerFetch } from "@/lib/ownerFetch";
import { rupee, num } from "@/lib/owner/format";
import { usePagedList } from "@/lib/owner/usePagedList";

export default function HrByPositionPage() {
  const [filterState, setFilterState] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const list = usePagedList({ defaultSort: "interviews", defaultDir: "desc" });

  const load = useCallback(
    async ({ signal } = {}) => {
      if (!filterState) return;
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.set("dateFrom", filterState.range.from);
      params.set("dateTo", filterState.range.to);
      const r = await ownerFetch(`/api/owner/hr/by-position?${params.toString()}&${list.query}`, { signal });
      if (r.aborted) return;
      if (r.ok) setData(r.data);
      else setError(r.error);
      setLoading(false);
    },
    [filterState, list.query],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load({ signal: ctrl.signal });
    return () => ctrl.abort();
  }, [load]);

  const summary = data?.summary;

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
          <FilterBar show={["date"]} onChange={({ filters, range }) => { list.resetPage(); setFilterState({ filters, range }); }} />

          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <>
              <KpiRow
                loading={loading || !data}
                primaryIndex={0}
                items={[
                  { label: "Interviews", value: num(summary?.interviews), sub: `${num(summary?.positions)} positions`, kind: "info" },
                  { label: "Selected", value: num(summary?.selected), sub: "This period", kind: "good" },
                  { label: "Rejected", value: num(summary?.rejected), sub: "This period", kind: "bad" },
                  { label: "On Hold", value: num(summary?.onHold), sub: "This period", kind: "warn" },
                ]}
              />

              <Card title="Positions" subtitle={loading ? "Loading…" : `${data?.total || 0} positions`}>
                <ReportTable
                  tableId="hr-by-position"
                  loading={loading}
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
                  rows={(data?.rows || []).map((r) => ({ ...r, id: r.position }))}
                  total={data?.total || 0}
                  {...list.tableProps}
                  searchPlaceholder="Search position…"
                  csvFilename="hr-by-position.csv"
                />
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
