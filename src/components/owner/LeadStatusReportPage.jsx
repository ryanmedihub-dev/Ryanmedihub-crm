"use client";

import { useMemo, useState } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import OwnerTopbar from "./OwnerTopbar";
import Card from "./Card";
import FilterBar from "./FilterBar";
import ReportTable from "./ReportTable";
import KpiRow from "./KpiRow";
import ErrorState from "./ErrorState";
import InlineNotice from "./InlineNotice";
import { AiBriefPanel } from "./ai";
import { useAiInsight } from "@/lib/ai/client/useAiInsight";
import { useOwnerData } from "@/lib/owner/useOwnerData";

// Shared shell for the four lead status-preset pages (Interested, Follow-ups,
// Not-interested, Unattempted — Owner Panel v2, Part 2): one table, one KPI
// row, one API route (/api/owner/leads/by-status), driven by `config.preset`.
// Each page file is just this config, same "config object, not a copy"
// pattern as Part 1's EmployeeReportPage.
export default function LeadStatusReportPage({ config }) {
  const [filterState, setFilterState] = useState(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState(config.defaultSort || "createdAt");
  const [sortDir, setSortDir] = useState(config.defaultSortDir || "desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const aiScope = useMemo(
    () => (filterState ? { preset: config.preset, dateFrom: filterState.range.from, dateTo: filterState.range.to } : {}),
    [filterState, config.preset],
  );

  const url = useMemo(() => {
    if (!filterState) return null;
    const params = new URLSearchParams(aiScope);
    if (search) params.set("search", search);
    params.set("sortBy", sortKey);
    params.set("sortDir", sortDir);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    return `/api/owner/leads/by-status?${params.toString()}`;
  }, [filterState, aiScope, search, sortKey, sortDir, page, pageSize]);

  const { data, loading, error, mutate: load } = useOwnerData(url);
  const statusAi = useAiInsight(config.aiFeature || null, aiScope, { kind: "brief", enabled: !!config.aiFeature && !!filterState });

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
  const kpis = data ? config.kpis(data) : [];

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar
          title={config.title}
          subtitle={config.subtitle}
          aiState={config.aiFeature ? statusAi : undefined}
          controls={
            <button className="icon-btn" onClick={() => load()} disabled={loading} title="Refresh">
              {loading ? "…" : "⟳"}
            </button>
          }
        />

        <div className="content">
          <FilterBar
            show={["date"]}
            onChange={({ filters, range }) => {
              setPage(1);
              setFilterState({ filters, range });
            }}
          />

          {config.aiFeature && <AiBriefPanel feature={config.aiFeature} scope={aiScope} title={config.title} enabled={!!filterState} aiState={statusAi} />}

          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <>
              <KpiRow loading={loading || !data} items={kpis} primaryIndex={0} />

              {config.extraContent && data && config.extraContent(data)}

              <Card title={config.title} subtitle={loading ? "Loading…" : `${total} ${total === 1 ? "lead" : "leads"}`}>
                <ReportTable
                  tableId={`leads-${config.preset}`}
                  columns={config.columns}
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
                  searchPlaceholder="Search name / phone…"
                  page={page}
                  pageSize={pageSize}
                  total={total}
                  onPageChange={setPage}
                  onPageSizeChange={(n) => {
                    setPageSize(n);
                    setPage(1);
                  }}
                  csvFilename={`leads-${config.preset}.csv`}
                />
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
