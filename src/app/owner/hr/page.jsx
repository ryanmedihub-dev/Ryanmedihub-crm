"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, FilterBar, KpiRow, DataTable, ErrorState, TrendChart } from "@/components/owner";
import { ownerFetch } from "@/lib/ownerFetch";
import { num } from "@/lib/owner/format";

const LINKS = [
  { href: "/owner/hr/interviews", label: "All Interviews", note: "Full interview report" },
  { href: "/owner/hr/selected", label: "Selected", note: "+ joined status" },
  { href: "/owner/hr/rejected", label: "Rejected", note: "+ position breakdown" },
  { href: "/owner/hr/by-position", label: "By Position", note: "Which roles are hard to hire" },
  { href: "/owner/employees/hr", label: "HR Team", note: "Per-HR-employee performance" },
  { href: "/owner/finance/salary-incentive", label: "Salary & Incentive", note: "Payroll lives under Finance" },
];

export default function HrLanding() {
  const [filterState, setFilterState] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(
    async ({ signal } = {}) => {
      if (!filterState) return;
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.set("dateFrom", filterState.range.from);
      params.set("dateTo", filterState.range.to);
      const r = await ownerFetch(`/api/owner/hr/overview?${params.toString()}`, { signal });
      if (r.aborted) return;
      if (r.ok) setData(r.data);
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

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar
          title="HR"
          subtitle="Interviews, outcomes and hiring demand — links into every HR page"
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
            <>
              <KpiRow
                loading={loading || !data}
                primaryIndex={0}
                items={[
                  { label: "Interviews", value: num(data?.total), sub: "This period", kind: "info" },
                  { label: "Selected", value: num(data?.selected), sub: "This period", kind: "good" },
                  { label: "Rejected", value: num(data?.rejected), sub: "This period", kind: "bad" },
                  { label: "On Hold", value: num(data?.onHold), sub: "This period", kind: "warn" },
                  { label: "Selection Rate", value: data ? `${data.selectionRate}%` : "—", sub: "Selected ÷ total", kind: "good" },
                  { label: "Avg. Days to Decision", value: data?.avgDaysToDecision == null ? "—" : `${data.avgDaysToDecision}d`, sub: "Applied → decided", kind: "info" },
                ]}
              />

              <div className="grid cols-equal">
                <Card title="Demand by Position" subtitle="Top 15, this period">
                  <DataTable
                    loading={loading}
                    columns={[
                      { key: "position", label: "Position" },
                      { key: "count", label: "Interviews", align: "right", render: (r) => num(r.count) },
                    ]}
                    rows={(data?.byPosition || []).map((p, i) => ({ ...p, id: i }))}
                  />
                </Card>
                <Card title="Interviews Per Day" subtitle="This period">
                  <TrendChart data={data?.daywise || []} label="Interviews" />
                </Card>
              </div>

              <Card title="Jump to a page">
                <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
                  {LINKS.map((it) => (
                    <Link key={it.href} href={it.href} className="card" style={{ display: "block", textDecoration: "none" }}>
                      <div className="card-title">
                        <div>
                          <h3>{it.label}</h3>
                          <p>{it.note}</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
