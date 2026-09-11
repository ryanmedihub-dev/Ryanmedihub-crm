"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import OwnerTopbar from "./OwnerTopbar";
import Card from "./Card";
import FilterBar from "./FilterBar";
import ReportTable from "./ReportTable";
import KpiRow from "./KpiRow";
import ErrorState from "./ErrorState";
import { ownerFetch } from "@/lib/ownerFetch";

// Generic shell behind all six Patients list pages (Owner Panel v2, Part 3) —
// one table, one KPI row, one API route (/api/owner/patients?preset=...),
// driven by a config object. Same pattern as EmployeeReportPage/LeadStatusReportPage.
export default function PatientReportPage({ config }) {
  const router = useRouter();

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
      if (filterState.filters.branch && filterState.filters.branch !== "All") {
        params.set("branch", filterState.filters.branch);
      }
      if (search) params.set("search", search);
      params.set("sortBy", sortKey);
      params.set("sortDir", sortDir);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));

      const r = await ownerFetch(`/api/owner/patients?${params.toString()}`, { signal });
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

  const kpis = useMemo(() => (data ? config.kpis(data) : []), [data, config]);
  const rows = data?.rows || [];
  const total = data?.total || 0;

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
            show={["date", "branch"]}
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

              <Card title={config.title} subtitle={loading ? "Loading…" : `${total} ${total === 1 ? "patient" : "patients"}`}>
                <ReportTable
                  tableId={config.tableId}
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
                  onRowClick={(row) => router.push(`/owner/patients/${row.id}`)}
                  csvFilename={`patients-${config.preset}.csv`}
                />
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
