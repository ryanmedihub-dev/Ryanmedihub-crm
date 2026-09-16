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
import { usePagedList } from "@/lib/owner/usePagedList";

// "all" (not "") is a real, writable value here — useOwnerFilters treats an
// empty string as "reset to default", and the default below is "true"
// (Active), so "All statuses" needs its own sentinel or it could never be
// selected: picking it would just snap straight back to Active.
const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "true", label: "Active" },
  { value: "false", label: "Inactive" },
];

const CALLBY_LINKED_OPTIONS = [
  { value: "", label: "All" },
  { value: "true", label: "Linked to callby" },
  { value: "false", label: "Not linked" },
];

// Fields with no fixed option set — date-of-joining range, salary/incentive-rate
// range, and free-text role — tucked behind FilterBar's "More filters" toggle so
// the primary bar stays compact while every Employee field stays reachable.
const ADVANCED_EXTRAS = [
  { key: "role", label: "Role", type: "text", placeholder: "Role / designation" },
  { key: "dojFrom", label: "Joined from", type: "date" },
  { key: "dojTo", label: "Joined to", type: "date" },
  { key: "salaryMin", label: "Min salary", type: "number", placeholder: "Min salary" },
  { key: "salaryMax", label: "Max salary", type: "number", placeholder: "Max salary" },
  { key: "incentiveRateMin", label: "Min incentive rate", type: "number", placeholder: "Min incentive rate" },
  { key: "incentiveRateMax", label: "Max incentive rate", type: "number", placeholder: "Max incentive rate" },
];

const ADVANCED_DEFAULTS = {
  role: "", dojFrom: "", dojTo: "", salaryMin: "", salaryMax: "", incentiveRateMin: "", incentiveRateMax: "",
};

// Employee-document columns sort A→Z by default; every metric column reads
// best-first (highest) on the first click.
const TEXT_SORT_KEYS = new Set(["name", "phone", "email", "employeeId", "role", "branch", "tlName", "managerName", "dateOfJoining", "isactive"]);
const dirForKey = (key) => (TEXT_SORT_KEYS.has(key) ? "asc" : "desc");

// Generic shell behind all five Employees list pages (Owner Panel v2, Part 1) —
// the six pages are config objects, not six copies of this component. See
// src/app/owner/employees/agents/page.jsx for the config shape.
export default function EmployeeReportPage({ config }) {
  const router = useRouter();

  const [filterState, setFilterState] = useState(null);
  const defaultSort = config.defaultSort || "name";
  const list = usePagedList({ defaultSort, defaultDir: dirForKey(defaultSort), dirForKey });

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(
    async ({ signal } = {}) => {
      if (!filterState) return;
      setLoading(true);
      setError(null);

      const params = new URLSearchParams(list.query);
      params.set("dateFrom", filterState.range.from);
      params.set("dateTo", filterState.range.to);
      if (filterState.filters.branch && filterState.filters.branch !== "All") {
        params.set("branch", filterState.filters.branch);
      }
      if (filterState.filters.isactive) params.set("isactive", filterState.filters.isactive);
      if (filterState.filters.callbyLinked) params.set("callbyLinked", filterState.filters.callbyLinked);
      if (filterState.filters.q) params.set("search", filterState.filters.q);
      for (const ex of ADVANCED_EXTRAS) {
        const v = filterState.filters[ex.key];
        if (v) params.set(ex.key, v);
      }

      const r = await ownerFetch(`${config.endpoint}?${params.toString()}`, { signal });
      if (r.aborted) return;
      if (r.ok) setData(r.data);
      else setError(r.error);
      setLoading(false);
    },
    [filterState, list.query, config.endpoint],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load({ signal: ctrl.signal });
    return () => ctrl.abort();
  }, [load]);

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

  // Carry the active date preset into the detail page via the same URL
  // vocabulary its own FilterBar reads (range / from / to).
  const detailQuery = useMemo(() => {
    const f = filterState?.filters;
    if (!f || !f.range || f.range === "Today") return "";
    const q = new URLSearchParams({ range: f.range });
    if (f.range === "Custom") {
      if (f.from) q.set("from", f.from);
      if (f.to) q.set("to", f.to);
    }
    return `?${q.toString()}`;
  }, [filterState]);

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
            extras={[
              { key: "isactive", label: "Status", options: STATUS_OPTIONS },
              { key: "callbyLinked", label: "callby link", options: CALLBY_LINKED_OPTIONS },
              { key: "q", label: "Search", type: "text", placeholder: "Name / phone / email / ID / TL / manager" },
            ]}
            advancedExtras={ADVANCED_EXTRAS}
            // Active-only by default — an owner opening an Employees page wants
            // today's headcount, not every employee who ever existed; "All
            // statuses" / "Inactive" is one click away in the Status dropdown.
            defaults={{ isactive: "true", callbyLinked: "", q: "", ...ADVANCED_DEFAULTS }}
            onChange={({ filters, range }) => {
              list.resetPage();
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
                title={`${config.title} list`}
                subtitle={loading ? "Loading…" : `${num(total)} ${total === 1 ? "record" : "records"}`}
              >
                <ReportTable
                  tableId={config.tableId}
                  columns={config.columns}
                  rows={rows}
                  loading={loading}
                  {...list.tableProps}
                  onSearchChange={undefined}
                  total={total}
                  onRowClick={(row) => router.push(`${config.detailBase}/${row.id}${detailQuery}`)}
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
