"use client";

import { useMemo, useState } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, FilterBar, ReportTable, KpiRow, ErrorState } from "@/components/owner";
import { AiBriefPanel } from "@/components/owner/ai";
import { useAiInsight } from "@/lib/ai/client/useAiInsight";
import { useOwnerData } from "@/lib/owner/useOwnerData";
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

  const aiScope = useMemo(
    () => (filterState ? { dateFrom: filterState.range.from, dateTo: filterState.range.to, status: filterState.filters.status || "", experienceType: filterState.filters.experienceType || "" } : {}),
    [filterState],
  );

  const url = useMemo(() => {
    if (!filterState) return null;
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
    return `/api/owner/hr/interviews?${params.toString()}`;
  }, [filterState, search, sortKey, sortDir, page, pageSize]);

  const { data, loading, error, mutate: load } = useOwnerData(url);
  const interviewsAi = useAiInsight("hr.interviews", aiScope, { kind: "brief", enabled: !!filterState });

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
          aiState={interviewsAi}
          controls={
            <button className="icon-btn" onClick={() => load()} disabled={loading} title="Refresh">
              {loading ? "…" : "⟳"}
            </button>
          }
        />

        <div className="content">
          <AiBriefPanel feature="hr.interviews" scope={aiScope} title="All Interviews" enabled={!!filterState} aiState={interviewsAi} />

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
