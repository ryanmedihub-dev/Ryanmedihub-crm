"use client";

import { useMemo, useState } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, FilterBar, ReportTable, KpiRow, ErrorState } from "@/components/owner";
import { AiBriefPanel } from "@/components/owner/ai";
import { useAiInsight } from "@/lib/ai/client/useAiInsight";
import { useOwnerData } from "@/lib/owner/useOwnerData";
import { rupee, num } from "@/lib/owner/format";
import { usePagedList } from "@/lib/owner/usePagedList";

export default function HrByPositionPage() {
  const [filterState, setFilterState] = useState(null);
  const list = usePagedList({ defaultSort: "interviews", defaultDir: "desc" });

  const aiScope = useMemo(() => (filterState ? { dateFrom: filterState.range.from, dateTo: filterState.range.to } : {}), [filterState]);

  const url = useMemo(() => {
    if (!filterState) return null;
    const params = new URLSearchParams();
    params.set("dateFrom", filterState.range.from);
    params.set("dateTo", filterState.range.to);
    return `/api/owner/hr/by-position?${params.toString()}&${list.query}`;
  }, [filterState, list.query]);

  const { data, loading, error, isValidating, mutate: load } = useOwnerData(url);
  const byPositionAi = useAiInsight("hr.byPosition", aiScope, { kind: "brief", enabled: !!filterState });

  const summary = data?.summary;

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar
          title="By Position"
          subtitle="Which roles are hard to hire — selection rate, salary gap, time to fill"
          aiState={byPositionAi}
          controls={
            <button className="icon-btn" onClick={() => load()} disabled={isValidating} title="Refresh">
              {isValidating ? "…" : "⟳"}
            </button>
          }
        />

        <div className="content">
          <AiBriefPanel feature="hr.byPosition" scope={aiScope} title="By Position" enabled={!!filterState} aiState={byPositionAi} />

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
