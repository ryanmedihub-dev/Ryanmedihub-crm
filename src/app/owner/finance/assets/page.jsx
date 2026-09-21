"use client";

import { useState } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, FilterBar, KpiRow, DataTable, ErrorState, Badge } from "@/components/owner";
import { useOwnerData } from "@/lib/owner/useOwnerData";
import { rupee, num } from "@/lib/owner/format";

// Presents /api/receivables/summary's data with owner-level rollups — the
// same read the existing /admin/assets pages use, not a re-derived total
// (Owner Panel v2, Part 5).
export default function FinanceAssetsPage() {
  const [filterState, setFilterState] = useState(null);

  const branch = filterState?.filters?.branch && filterState.filters.branch !== "All" ? filterState.filters.branch : "";
  const summaryUrl = filterState ? `/api/receivables/summary?${new URLSearchParams(branch ? { branch } : {}).toString()}` : null;
  const ageingUrl = filterState ? `/api/receivables/summary?${new URLSearchParams({ ageing: "1", ...(branch ? { branch } : {}) }).toString()}` : null;

  const { data: summaryData, loading, error, isValidating: summaryValidating, mutate: loadSummary } = useOwnerData(summaryUrl);
  const { data: ageingData, isValidating: ageingValidating, mutate: loadAgeing } = useOwnerData(ageingUrl);

  const overall = summaryData?.overall || null;
  const byPurpose = summaryData?.byPurpose || [];
  const byBucket = ageingData?.byBucket || [];
  const isValidating = summaryValidating || ageingValidating;
  const load = () => { loadSummary(); loadAgeing(); };

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar
          title="Assets"
          subtitle="Receivables outstanding — same data as /admin/assets, owner-level rollup"
          controls={
            <button className="icon-btn" onClick={() => load()} disabled={isValidating} title="Refresh">
              {isValidating ? "…" : "⟳"}
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
                  { label: "Total Owed", value: rupee(overall?.totalOwed), sub: `${num(overall?.count)} receivables`, kind: "info" },
                  { label: "Received", value: rupee(overall?.totalPaid), sub: "So far", kind: "good" },
                  { label: "Pending", value: rupee(overall?.totalPending), sub: "Outstanding", kind: overall?.totalPending > 0 ? "warn" : "good" },
                ]}
              />

              <div className="grid cols-equal">
                <Card title="By Purpose">
                  <DataTable
                    loading={loading}
                    columns={[
                      { key: "purpose", label: "Purpose", render: (r) => r._id || "—" },
                      { key: "count", label: "Count", align: "right", render: (r) => num(r.count) },
                      { key: "totalOwed", label: "Owed", align: "right", render: (r) => rupee(r.totalOwed) },
                      { key: "totalPending", label: "Pending", align: "right", render: (r) => rupee(r.totalPending) },
                    ]}
                    rows={byPurpose.map((r, i) => ({ ...r, id: i }))}
                  />
                </Card>
                <Card title="Aging" subtitle="Pending only">
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
