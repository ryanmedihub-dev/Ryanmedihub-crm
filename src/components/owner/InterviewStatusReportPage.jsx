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

// Shared shell for the Selected/Rejected interview pages (Owner Panel v2,
// Part 5) — same "config object, one component" pattern as Part 2's
// LeadStatusReportPage. One table, one KPI row, one API route
// (/api/owner/hr/by-status), driven by config.preset.
export default function InterviewStatusReportPage({ config }) {
  const [filterState, setFilterState] = useState(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState(config.defaultSort || "date");
  const [sortDir, setSortDir] = useState(config.defaultSortDir || "desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

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

      const r = await ownerFetch(`/api/owner/hr/by-status?${params.toString()}`, { signal });
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

  // Matches the candidate to a real Employee by phone (then exact name),
  // server-side — never guesses; "Unmark" just clears the link.
  const markJoined = config.allowMarkJoined
    ? async (row) => {
        const r = await ownerFetch(`/api/owner/hr/interviews/${row.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(row.hiredEmployeeId ? { hiredEmployeeId: null } : { action: "markJoined" }),
        });
        if (r.ok) {
          setNotice({
            kind: "info",
            text: row.hiredEmployeeId ? "Unmarked." : `Marked as joined — matched to ${r.data?.employee?.name || "an employee"}.`,
          });
          load();
        } else {
          setNotice({ kind: "error", text: r.error });
        }
      }
    : null;

  const rows = data?.rows || [];
  const total = data?.total || 0;
  const kpis = data ? config.kpis(data) : [];
  const columns = markJoined
    ? [
        ...config.columns,
        {
          key: "markJoined",
          label: "",
          align: "right",
          render: (r) => (
            <button type="button" className="link-btn" onClick={(e) => { e.stopPropagation(); markJoined(r); }}>
              {r.hiredEmployeeId ? "Unmark" : "Mark as Joined"}
            </button>
          ),
        },
      ]
    : config.columns;

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
          <FilterBar show={["date"]} onChange={({ filters, range }) => { setPage(1); setFilterState({ filters, range }); }} />

          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <>
              <KpiRow loading={loading || !data} items={kpis} primaryIndex={0} />

              {notice && (
                <InlineNotice kind={notice.kind === "error" ? "error" : "info"} title={notice.kind === "error" ? "Couldn't complete that" : "Done"}>
                  {notice.text}
                </InlineNotice>
              )}

              {config.extraContent && data && config.extraContent(data)}

              <Card title={config.title} subtitle={loading ? "Loading…" : `${total} ${total === 1 ? "candidate" : "candidates"}`}>
                <ReportTable
                  tableId={`hr-${config.preset}`}
                  columns={columns}
                  rows={rows}
                  loading={loading}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                  search={search}
                  onSearchChange={(v) => { setSearch(v); setPage(1); }}
                  searchPlaceholder="Search name / phone / position…"
                  page={page}
                  pageSize={pageSize}
                  total={total}
                  onPageChange={setPage}
                  onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
                  csvFilename={`hr-${config.preset}.csv`}
                />
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
