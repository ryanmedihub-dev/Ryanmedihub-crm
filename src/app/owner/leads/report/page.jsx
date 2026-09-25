"use client";

import { useMemo, useState } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, FilterBar, ReportTable, KpiRow, ErrorState } from "@/components/owner";
import { AiBriefPanel } from "@/components/owner/ai";
import { useAiInsight } from "@/lib/ai/client/useAiInsight";
import { useOwnerData } from "@/lib/owner/useOwnerData";
import { num } from "@/lib/owner/format";
import { LEAD_BASE_COLUMNS } from "@/lib/owner/leadsColumns";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "not_connected", label: "Not Connected" },
  { value: "interested", label: "Interested" },
  { value: "not_interested", label: "Not Interested" },
  { value: "follow_up", label: "Follow-up" },
  { value: "booking_done", label: "Booking Done" },
  { value: "converted", label: "Converted" },
  { value: "lost", label: "Lost" },
];

export default function LeadsReportPage() {
  const [filterState, setFilterState] = useState(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("createdAt");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const aiScope = useMemo(() => {
    if (!filterState) return {};
    const s = { dateFrom: filterState.range.from, dateTo: filterState.range.to };
    if (filterState.filters.status) s.status = filterState.filters.status;
    return s;
  }, [filterState]);

  const url = useMemo(() => {
    if (!filterState) return null;
    const params = new URLSearchParams(aiScope);
    if (search) params.set("search", search);
    params.set("sortBy", sortKey);
    params.set("sortDir", sortDir);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    return `/api/owner/leads/report?${params.toString()}`;
  }, [filterState, aiScope, search, sortKey, sortDir, page, pageSize]);

  const { data, loading, error, mutate: load } = useOwnerData(url);
  const reportAi = useAiInsight("leads.report", aiScope, { kind: "brief", enabled: !!filterState });

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
          title="Lead Report"
          subtitle="Full lead report — mirrors callby's own Lead Reports page"
          aiState={reportAi}
          controls={
            <button className="icon-btn" onClick={() => load()} disabled={loading} title="Refresh">
              {loading ? "…" : "⟳"}
            </button>
          }
        />

        <div className="content">
          <AiBriefPanel feature="leads.report" scope={aiScope} title="Lead Report" enabled={!!filterState} aiState={reportAi} />

          <FilterBar
            show={["date"]}
            extras={[{ key: "status", label: "Status", options: STATUS_OPTIONS }]}
            defaults={{ status: "" }}
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
                items={[{ label: "Total Leads", value: num(total), sub: "This period", kind: "info" }]}
              />

              <Card title="Leads" subtitle={loading ? "Loading…" : `${total} leads`}>
                <ReportTable
                  tableId="leads-report"
                  columns={LEAD_BASE_COLUMNS}
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
                  searchPlaceholder="Search name / phone / email…"
                  page={page}
                  pageSize={pageSize}
                  total={total}
                  onPageChange={setPage}
                  onPageSizeChange={(n) => {
                    setPageSize(n);
                    setPage(1);
                  }}
                  csvFilename="leads-report.csv"
                />
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
