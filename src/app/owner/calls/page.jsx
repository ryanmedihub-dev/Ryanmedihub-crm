"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, FilterBar, KpiRow, ErrorState, TrendChart } from "@/components/owner";
import { useOwnerData } from "@/lib/owner/useOwnerData";
import { num, fmtDurationShort } from "@/lib/owner/format";

const LINKS = [
  { href: "/owner/calls/live", label: "Live Agent Status", note: "Per-agent call activity, live" },
  { href: "/owner/calls/report", label: "Call Report", note: "Full call log, filterable" },
  { href: "/owner/calls/employee-report", label: "Employee Call Report", note: "Per-agent summary + target attainment" },
  { href: "/owner/calls/untracked", label: "Untracked Calls", note: "Calls outside the CRM" },
  { href: "/owner/calls/forecast", label: "Forecast & Staffing", note: "Projected load vs capacity" },
  { href: "/owner/calls/sim-health", label: "Phone & SIM Health", note: "Coming later" },
];

export default function CallsLanding() {
  const [filterState, setFilterState] = useState(null);

  const url = useMemo(() => {
    if (!filterState) return null;
    const params = new URLSearchParams();
    params.set("dateFrom", filterState.range.from);
    params.set("dateTo", filterState.range.to);
    return `/api/owner/calls/overview?${params.toString()}`;
  }, [filterState]);

  const { data, loading, error, isValidating, mutate: load } = useOwnerData(url);

  const selected = data?.selected;

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar
          title="Calls"
          subtitle="Call volume, connect rate, and links into every calls page"
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
                  { label: "Total Calls", value: num(selected?.totalCalls), sub: "This period", kind: "info" },
                  { label: "Connected", value: num(selected?.connectedCalls), sub: "This period", kind: "good" },
                  {
                    label: "Connect Rate",
                    value: selected?.totalCalls ? `${Math.round((selected.connectedCalls / selected.totalCalls) * 100)}%` : "—",
                    sub: "Calls connected",
                    kind: "good",
                  },
                  { label: "Unique Numbers Dialled", value: num(selected?.uniqueClients), sub: "This period", kind: "info" },
                  { label: "Total Talk Time", value: selected ? fmtDurationShort(selected.callDurationSec) : "—", sub: "This period", kind: "info" },
                ]}
              />

              <Card title="Calls by Hour" subtitle="This period, IST">
                <TrendChart data={(data?.callsPerHour || []).map((h) => ({ date: `${h.hour}:00`, value: h.count }))} label="Calls" />
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
