"use client";

import { useCallback, useEffect, useState } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, FilterBar, ReportTable, KpiRow, ErrorState } from "@/components/owner";
import { ownerFetch } from "@/lib/ownerFetch";
import { num } from "@/lib/owner/format";
import { INTERVIEW_BASE_COLUMNS } from "@/lib/owner/interviewColumns";

const STATUS_OPTIONS = [
  { value: "", label: "All outcomes" },
  { value: "Applied", label: "Applied" },
  { value: "Interview Scheduled", label: "Interview Scheduled" },
  { value: "Selected", label: "Selected" },
  { value: "Rejected", label: "Rejected" },
  { value: "On Hold", label: "On Hold" },
];
const EXPERIENCE_OPTIONS = [
  { value: "", label: "All" },
  { value: "Fresher", label: "Fresher" },
  { value: "Experienced", label: "Experienced" },
];

export default function HrInterviewsPage() {
  const [filterState, setFilterState] = useState(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("date");
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
      if (filterState.filters.status) params.set("status", filterState.filters.status);
      if (filterState.filters.experienceType) params.set("experienceType", filterState.filters.experienceType);
      if (search) params.set("search", search);
      params.set("sortBy", sortKey);
      params.set("sortDir", sortDir);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));

      const r = await ownerFetch(`/api/owner/hr/interviews?${params.toString()}`, { signal });
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
  const totals = data?.totals || {};

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar
          title="All Interviews"
          subtitle="Full interview report"
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
              { key: "status", label: "Outcome", options: STATUS_OPTIONS },
              { key: "experienceType", label: "Experience", options: EXPERIENCE_OPTIONS },
            ]}
            defaults={{ status: "", experienceType: "" }}
            onChange={({ filters, range }) => { setPage(1); setFilterState({ filters, range }); }}
          />

          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <>
              <KpiRow
                loading={loading || !data}
                primaryIndex={0}
                items={[
                  { label: "Total Interviews", value: num(total), sub: "This period", kind: "info" },
                  { label: "Selected", value: num(totals.selected), sub: "This period", kind: "good" },
                  { label: "Rejected", value: num(totals.rejected), sub: "This period", kind: "bad" },
                  { label: "On Hold", value: num(totals.onHold), sub: "This period", kind: "warn" },
                ]}
              />

              <Card title="Interviews" subtitle={loading ? "Loading…" : `${total} candidates`}>
                <ReportTable
                  tableId="hr-interviews"
                  columns={INTERVIEW_BASE_COLUMNS}
                  rows={rows}
                  loading={loading}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                  search={search}
                  onSearchChange={(v) => { setSearch(v); setPage(1); }}
                  searchPlaceholder="Search name / phone / email / position…"
                  page={page}
                  pageSize={pageSize}
                  total={total}
                  onPageChange={setPage}
                  onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
                  csvFilename="hr-interviews.csv"
                />
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
