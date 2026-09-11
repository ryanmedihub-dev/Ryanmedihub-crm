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
import InlineNotice from "./InlineNotice";
import { ownerFetch } from "@/lib/ownerFetch";
import { rupee, num } from "@/lib/owner/format";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "true", label: "Active" },
  { value: "false", label: "Inactive" },
];

// Generic shell behind all five Employees list pages (Owner Panel v2, Part 1) —
// the six pages are config objects, not six copies of this component. See
// src/app/owner/employees/agents/page.jsx for the config shape.
export default function EmployeeReportPage({ config }) {
  const router = useRouter();

  const [filterState, setFilterState] = useState(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState(config.defaultSort || "name");
  const [sortDir, setSortDir] = useState("asc");
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
      if (filterState.filters.branch && filterState.filters.branch !== "All") {
        params.set("branch", filterState.filters.branch);
      }
      if (filterState.filters.isactive) params.set("isactive", filterState.filters.isactive);
      if (search) params.set("search", search);
      params.set("sortBy", sortKey);
      params.set("sortDir", sortDir);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));

      const r = await ownerFetch(`${config.endpoint}?${params.toString()}`, { signal });
      if (r.aborted) return;
      if (r.ok) setData(r.data);
      else setError(r.error);
      setLoading(false);
    },
    [filterState, search, sortKey, sortDir, page, pageSize, config.endpoint],
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

  const kpis = useMemo(
    () =>
      (data?.kpis || []).map((k) => ({
        ...k,
        value: k.format === "currency" ? rupee(k.value) : typeof k.value === "number" ? num(k.value) : k.value,
      })),
    [data],
  );

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
            extras={[{ key: "isactive", label: "Status", options: STATUS_OPTIONS }]}
            defaults={{ isactive: "" }}
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

              {data?.callbyError && (
                <InlineNotice kind="error" title="callby data may be incomplete for this page">
                  {data.callbyError}
                </InlineNotice>
              )}

              <Card
                title={config.title}
                subtitle={loading ? "Loading…" : `${total} ${total === 1 ? "record" : "records"}`}
              >
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
                  searchPlaceholder="Search name / phone / employee ID / TL…"
                  page={page}
                  pageSize={pageSize}
                  total={total}
                  onPageChange={setPage}
                  onPageSizeChange={(n) => {
                    setPageSize(n);
                    setPage(1);
                  }}
                  onRowClick={(row) => {
                    // Carry the active date filter into the detail page via the
                    // same URL vocabulary its own FilterBar reads (range=Custom
                    // + from/to) — no separate plumbing needed on either side.
                    const from = (filterState?.range?.from || "").slice(0, 10);
                    const to = (filterState?.range?.to || "").slice(0, 10);
                    const qs = from && to ? `?range=Custom&from=${from}&to=${to}` : "";
                    router.push(`${config.detailBase}/${row.id}${qs}`);
                  }}
                  csvFilename={`${config.tableId}.csv`}
                />
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
