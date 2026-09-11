"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, FilterBar, KpiRow, DataTable, ErrorState, TrendChart, Funnel } from "@/components/owner";
import { ownerFetch } from "@/lib/ownerFetch";
import { num, rupee } from "@/lib/owner/format";
import { PATIENT_STATUS_LABELS } from "@/lib/owner/patientStatus";

const STATUS_ORDER = ["NEW", "NOT_VISITED", "NOT_CONVERTED", "BOOKING_DONE", "SURGERY_BOOKED", "CLOSED"];

const LINKS = [
  { href: "/owner/patients/all", label: "All Patients", note: "Full list, every status" },
  { href: "/owner/patients/not-converted", label: "Not Converted", note: "Counselled, never paid" },
  { href: "/owner/patients/booking-done", label: "Booking Done", note: "Partial payment made" },
  { href: "/owner/patients/converted", label: "Converted", note: "Fully paid" },
  { href: "/owner/patients/surgery-done", label: "Surgery Done", note: "Completed surgeries + clinical detail" },
  { href: "/owner/patients/direct", label: "Direct", note: "Walk-in / no agent" },
];

export default function PatientsLanding() {
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
      if (filterState.filters.branch && filterState.filters.branch !== "All") params.set("branch", filterState.filters.branch);
      const r = await ownerFetch(`/api/owner/patients/overview?${params.toString()}`, { signal });
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

  const breakdownByStatus = Object.fromEntries((data?.statusBreakdown || []).map((s) => [s.status, s.count]));
  const funnelStages = STATUS_ORDER.map((status) => ({ label: PATIENT_STATUS_LABELS[status], value: breakdownByStatus[status] || 0 }));

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar
          title="Patients"
          subtitle="Status funnel, revenue and branch split — pure ryan-crm data, no external system"
          controls={
            <button className="icon-btn" onClick={() => load()} disabled={loading} title="Refresh">
              {loading ? "…" : "⟳"}
            </button>
          }
        />

        <div className="content">
          <FilterBar show={["date", "branch"]} onChange={({ filters, range }) => setFilterState({ filters, range })} />

          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <>
              <KpiRow
                loading={loading || !data}
                primaryIndex={0}
                items={[
                  { label: "Total Patients", value: num(data?.total), sub: "This period", kind: "info" },
                  { label: "Amount Received", value: rupee(data?.receivedSum), sub: "This period", kind: "good" },
                  { label: "Conversion Rate", value: data ? `${data.conversionRate}%` : "—", sub: "Converted or surgery done, ever", kind: "good" },
                ]}
              />

              <Card title="Status Funnel" subtitle="This period">
                <Funnel items={funnelStages} />
              </Card>

              <div className="grid cols-equal">
                <Card title="By Branch">
                  <DataTable
                    loading={loading}
                    columns={[
                      { key: "branch", label: "Branch" },
                      { key: "count", label: "Patients", align: "right", render: (r) => num(r.count) },
                    ]}
                    rows={(data?.byBranch || []).map((b, i) => ({ ...b, id: i }))}
                  />
                </Card>
                <Card title="Patients Per Day" subtitle="This period">
                  <TrendChart data={data?.daywise || []} label="Patients" />
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
