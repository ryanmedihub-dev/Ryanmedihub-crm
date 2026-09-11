"use client";

import { useCallback, useEffect, useState } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import OwnerTopbar from "./OwnerTopbar";
import Card from "./Card";
import FilterBar from "./FilterBar";
import ReportTable from "./ReportTable";
import KpiRow from "./KpiRow";
import ErrorState from "./ErrorState";
import InlineNotice from "./InlineNotice";
import { ownerFetch } from "@/lib/ownerFetch";

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

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(
    async ({ signal } = {}) => {
      if (!filterState) return;
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set("preset", config.preset);
      params.set("dateFrom", filterState.range.from);
      params.set("dateTo", filterState.range.to);
      if (search) params.set("search", search);
      params.set("sortBy", sortKey);
      params.set("sortDir", sortDir);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));

      const r = await ownerFetch(`/api/owner/leads/by-status?${params.toString()}`, { signal });
      if (r.aborted) return;
      if (r.ok) setData(r.data);
      else setError(r.error);
      setLoading(false);
    },
    [filterState, search, sortKey, sortDir, page, pageSize, config.preset],
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
  const kpis = data ? config.kpis(data) : [];

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar
          title={config.title}
          subtitle={config.subtitle}
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
