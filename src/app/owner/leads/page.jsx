"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, FilterBar, KpiRow, DataTable, ErrorState, TrendChart } from "@/components/owner";
import { useOwnerData } from "@/lib/owner/useOwnerData";
import { num } from "@/lib/owner/format";

const LINKS = [
  { href: "/owner/leads/report", label: "Lead Report", note: "Full lead report, filterable" },
  { href: "/owner/leads/interested", label: "Interested", note: "Sorted by staleness" },
  { href: "/owner/leads/follow-ups", label: "Follow-ups", note: "Overdue-first" },
  { href: "/owner/leads/not-interested", label: "Not Interested / Lost", note: "+ recovery view" },
  { href: "/owner/leads/unattempted", label: "Unattempted", note: "attempts: 0, oldest first" },
  { href: "/owner/leads/retry", label: "Retry & Recovery", note: "P0–P4 priority queue" },
  { href: "/owner/ai/attention", label: "Attention", note: "Where leads (and patients, and performance) fall out — was Leak Control Room" },
];

export default function LeadsLanding() {
  const [filterState, setFilterState] = useState(null);

  const url = useMemo(() => {
    if (!filterState) return null;
    const params = new URLSearchParams();
    params.set("dateFrom", filterState.range.from);
    params.set("dateTo", filterState.range.to);
    return `/api/owner/leads/overview?${params.toString()}`;
  }, [filterState]);

  const { data, loading, error, isValidating, mutate: load } = useOwnerData(url);

  const s = data?.summary?.total || {};
  const sidebar = data?.sidebarStats || {};

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar
          title="Leads"
          subtitle="Pipeline health by status and source — links into every leads page"
          controls={
            <button className="icon-btn" onClick={() => load()} disabled={isValidating} title="Refresh">
              {isValidating ? "…" : "⟳"}
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
                  { label: "Total Leads", value: num(s.leads), sub: "This period", kind: "info" },
                  { label: "Unattempted", value: num(sidebar.uncontacted), sub: "attempts: 0", kind: sidebar.uncontacted ? "warn" : "good" },
                  { label: "Follow-ups Due", value: num(sidebar.followUpsDue), sub: "Past their date", kind: sidebar.followUpsDue ? "bad" : "good" },
                  { label: "Converted", value: num(sidebar.converted), sub: "This period", kind: "good" },
                  { label: "Sources", value: num(sidebar.uniqueSources), sub: "Distinct source tags", kind: "info" },
                ]}
              />

              <div className="grid cols-equal">
                <Card title="By Status">
                  <DataTable
                    loading={loading}
                    columns={[
                      { key: "name", label: "Status" },
                      { key: "value", label: "Leads", align: "right", render: (r) => num(r.value) },
                    ]}
                    rows={(data?.pieData || []).map((p, i) => ({ ...p, id: i }))}
                  />
                </Card>
                <Card title="By Source">
                  <DataTable
                    loading={loading}
                    columns={[
                      { key: "source", label: "Source" },
                      { key: "total", label: "Leads", align: "right", render: (r) => num(r.total) },
                      { key: "conversionRate", label: "Conversion", align: "right", render: (r) => `${r.conversionRate || 0}%` },
                    ]}
                    rows={(data?.sources || []).map((s2, i) => ({ ...s2, id: i }))}
                  />
                </Card>
              </div>

              <Card title="Leads Per Day" subtitle="This period">
                <TrendChart data={(data?.daywise || []).slice().reverse().map((d) => ({ date: d.label, value: d.total }))} label="Leads" />
              </Card>

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
