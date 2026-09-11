"use client";

import { useCallback, useEffect, useState } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, FilterBar, KpiRow, DataTable, ErrorState, Badge } from "@/components/owner";
import { ownerFetch } from "@/lib/ownerFetch";
import { rupee, num } from "@/lib/owner/format";

// Presents /api/payables/summary's data with owner-level rollups — the same
// read /admin/liabilities uses (SALARY/RENT/ELECTRICITY/COLLAB_CLINIC/TAX/...
// purposes), not a re-derived total (Owner Panel v2, Part 5).
export default function FinanceLiabilitiesPage() {
  const [filterState, setFilterState] = useState(null);
  const [overall, setOverall] = useState(null);
  const [byPurpose, setByPurpose] = useState([]);
  const [byBucket, setByBucket] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(
    async ({ signal } = {}) => {
      if (!filterState) return;
      setLoading(true);
      setError(null);
      const branch = filterState.filters.branch && filterState.filters.branch !== "All" ? filterState.filters.branch : "";
      const summaryParams = new URLSearchParams(branch ? { branch } : {});
      const ageingParams = new URLSearchParams({ ageing: "1", ...(branch ? { branch } : {}) });

      const [summaryR, ageingR] = await Promise.all([
        ownerFetch(`/api/payables/summary?${summaryParams.toString()}`, { signal }),
        ownerFetch(`/api/payables/summary?${ageingParams.toString()}`, { signal }),
      ]);
      if (summaryR.aborted) return;
      if (summaryR.ok) {
        setOverall(summaryR.data?.overall || null);
        setByPurpose(summaryR.data?.byPurpose || []);
      } else {
        setError(summaryR.error);
      }
      if (ageingR.ok) setByBucket(ageingR.data?.byBucket || []);
      setLoading(false);
    },
    [filterState],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load({ signal: ctrl.signal });
    return () => ctrl.abort();
  }, [load]);

  const overdue = byBucket.filter((b) => b._id && b._id !== "0-30").reduce((s, b) => s + (b.totalPending || 0), 0);

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar
          title="Liabilities"
          subtitle="Payables outstanding — same data as /admin/liabilities, owner-level rollup"
          controls={
            <button className="icon-btn" onClick={() => load()} disabled={loading} title="Refresh">
              {loading ? "…" : "⟳"}
            </button>
          }
        />

        <div className="content">
          <FilterBar show={["branch"]} onChange={({ filters, range }) => setFilterState({ filters, range })} />

          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <>
              <KpiRow
                loading={loading || !overall}
                primaryIndex={0}
                items={[
                  { label: "Total Owed", value: rupee(overall?.totalOwed), sub: `${num(overall?.count)} payables`, kind: "info" },
                  { label: "Paid", value: rupee(overall?.totalPaid), sub: "So far", kind: "good" },
                  { label: "Pending", value: rupee(overall?.totalPending), sub: "Outstanding", kind: overall?.totalPending > 0 ? "warn" : "good" },
                  { label: "Overdue", value: rupee(overdue), sub: "Past 30 days", kind: overdue > 0 ? "bad" : "good" },
                ]}
              />

              <div className="grid cols-equal">
                <Card title="By Purpose" subtitle="SALARY / RENT / ELECTRICITY / COLLAB_CLINIC / TAX / ...">
                  <DataTable
                    loading={loading}
                    columns={[
                      { key: "purpose", label: "Purpose", render: (r) => r._id || "—" },
                      { key: "count", label: "Count", align: "right", render: (r) => num(r.count) },
                      { key: "totalOwed", label: "Owed", align: "right", render: (r) => rupee(r.totalOwed) },
                      { key: "totalPaid", label: "Paid", align: "right", render: (r) => rupee(r.totalPaid) },
                      { key: "totalPending", label: "Pending", align: "right", render: (r) => rupee(r.totalPending) },
                    ]}
                    rows={byPurpose.map((r, i) => ({ ...r, id: i }))}
                  />
                </Card>
                <Card title="Aging" subtitle="Pending only, overdue flagged">
                  <DataTable
                    loading={loading}
                    columns={[
                      { key: "bucket", label: "Bucket", render: (r) => <Badge kind={r._id === "0-30" ? "good" : r._id === "31-60" ? "warn" : "bad"}>{r._id || "—"}</Badge> },
                      { key: "count", label: "Count", align: "right", render: (r) => num(r.count) },
                      { key: "totalPending", label: "Pending", align: "right", render: (r) => rupee(r.totalPending) },
                    ]}
                    rows={byBucket.map((r, i) => ({ ...r, id: i }))}
                  />
                </Card>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
