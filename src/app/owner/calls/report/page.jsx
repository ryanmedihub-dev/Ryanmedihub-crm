"use client";

import { useCallback, useEffect, useState } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, FilterBar, ReportTable, KpiRow, ErrorState } from "@/components/owner";
import { ownerFetch } from "@/lib/ownerFetch";
import { num } from "@/lib/owner/format";
import { CALL_REPORT_COLUMNS } from "@/lib/owner/callsColumns";

const CALL_TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "incoming", label: "Incoming" },
  { value: "outgoing", label: "Outgoing" },
  { value: "missed", label: "Missed" },
  { value: "rejected", label: "Rejected" },
];
const CONNECTED_OPTIONS = [
  { value: "", label: "All calls" },
  { value: "true", label: "Connected only" },
];

export default function CallsReportPage() {
  const [filterState, setFilterState] = useState(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("timestamp");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

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
      if (filterState.filters.callType) params.set("callType", filterState.filters.callType);
      if (filterState.filters.connectedOnly) params.set("connectedOnly", filterState.filters.connectedOnly);
      if (search) params.set("search", search);
      params.set("sortBy", sortKey);
      params.set("sortDir", sortDir);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));

      const r = await ownerFetch(`/api/owner/calls/report?${params.toString()}`, { signal });
      if (r.aborted) return;
      if (r.ok) setData(r.data);
      else setError(r.error);
      setLoading(false);
    },
    [filterState, search, sortKey, sortDir, page, pageSize],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load({ signal: ctrl.signal });
    return () => ctrl.abort();
  }, [load]);

  const handleSort = (key) => {
    setPage(1);
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const rows = data?.rows || [];
  const total = data?.total || 0;

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar
          title="Call Report"
          subtitle="Full call log — mirrors callby's own Call History report"
          controls={
            <button className="icon-btn" onClick={() => load()} disabled={loading} title="Refresh">
              {loading ? "…" : "⟳"}
            </button>
          }
        />

        <div className="content">
          <FilterBar
            show={["date"]}
            extras={[
              { key: "callType", label: "Call Type", options: CALL_TYPE_OPTIONS },
              { key: "connectedOnly", label: "Connected", options: CONNECTED_OPTIONS },
            ]}
            defaults={{ callType: "", connectedOnly: "" }}
            onChange={({ filters, range }) => {
              setPage(1);
              setFilterState({ filters, range });
            }}
          />

          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <>
              <KpiRow
                loading={loading || !data}
                primaryIndex={0}
                items={[{ label: "Total Calls", value: num(total), sub: "This period", kind: "info" }]}
              />

              <Card title="Calls" subtitle={loading ? "Loading…" : `${total} calls`}>
                <ReportTable
                  tableId="calls-report"
                  columns={CALL_REPORT_COLUMNS}
                  rows={rows}
                  loading={loading}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                  search={search}
                  onSearchChange={(v) => {
                    setSearch(v);
                    setPage(1);
                  }}
                  searchPlaceholder="Search number / contact name…"
                  page={page}
                  pageSize={pageSize}
                  total={total}
                  onPageChange={setPage}
                  onPageSizeChange={(n) => {
                    setPageSize(n);
                    setPage(1);
                  }}
                  csvFilename="calls-report.csv"
                />
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
