"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import OwnerTopbar from "./OwnerTopbar";
import Card from "./Card";
import FilterBar from "./FilterBar";
import ReportTable from "./ReportTable";
import KpiRow from "./KpiRow";
import ErrorState from "./ErrorState";
import TrendChart from "./TrendChart";
import { useOwnerData } from "@/lib/owner/useOwnerData";
import { num } from "@/lib/owner/format";
import { usePagedList } from "@/lib/owner/usePagedList";

// Text columns open A→Z; everything else (dates, money, "days since") opens
// with the most recent / largest first.
const TEXT_SORT_KEYS = new Set(["name", "branch", "status", "technique"]);
const dirForKey = (key) => (TEXT_SORT_KEYS.has(key) ? "asc" : "desc");

// Generic shell behind all six Patients list pages (Owner Panel v2, Part 3) —
// one table, one KPI row, one API route (/api/owner/patients?preset=...),
// driven by a config object. Same pattern as EmployeeReportPage/LeadStatusReportPage.
//
// config: { preset, title, subtitle, tableId, defaultSort, defaultSortDir,
//           columns, kpis(data), extras?, extraContent?(data), trendLabel? }
export default function PatientReportPage({ config }) {
  const router = useRouter();

  const [filterState, setFilterState] = useState(null);
  const list = usePagedList({
    defaultSort: config.defaultSort || "createdAt",
    defaultDir: config.defaultSortDir || "desc",
    dirForKey,
  });

  const extras = config.extras || [];

  const url = useMemo(() => {
    if (!filterState) return null;
    const params = new URLSearchParams(list.query);
    params.set("preset", config.preset);
    params.set("dateFrom", filterState.range.from);
    params.set("dateTo", filterState.range.to);
    if (filterState.filters.branch && filterState.filters.branch !== "All") {
      params.set("branch", filterState.filters.branch);
    }
    if (filterState.filters.q) params.set("search", filterState.filters.q);
    for (const ex of extras) {
      const v = filterState.filters[ex.key];
      if (v && v !== "all") params.set(ex.key, v);
    }
    return `/api/owner/patients?${params.toString()}`;
  }, [filterState, list.query, config.preset, extras]);

  const { data, loading, error, isValidating, mutate: load } = useOwnerData(url);

  const kpis = useMemo(() => (data ? config.kpis(data) : []), [data, config]);
  const rows = data?.rows || [];
  const total = data?.total || 0;

  // The detail page's "Back" returns to THIS preset with the same filters.
  const backQuery = useMemo(() => {
    if (typeof window === "undefined") return "";
    const current = window.location.search.replace(/^\?/, "");
    const q = new URLSearchParams({ back: config.preset });
    if (current) q.set("backq", current);
    return `?${q.toString()}`;
  }, [config.preset, filterState]); // eslint-disable-line react-hooks/exhaustive-deps

  const extraDefaults = Object.fromEntries(extras.map((ex) => [ex.key, ex.defaultValue ?? ""]));

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar
          title={config.title}
          subtitle={config.subtitle}
          controls={
            <button className="icon-btn" onClick={() => load()} disabled={isValidating} title="Refresh">
              {isValidating ? "…" : "⟳"}
            </button>
          }
        />

        <div className="content">
          <FilterBar
            show={["date", "branch"]}
            extras={[
              ...extras,
              { key: "q", label: "Search", type: "text", placeholder: "Name / phone" },
            ]}
            defaults={{ q: "", ...extraDefaults, ...(config.filterDefaults || {}) }}
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

              {config.extraContent && data && config.extraContent(data)}

              {data?.trend?.length > 1 && (
                <Card title="Trend" subtitle={config.trendLabel || "Patients per day · selected period"}>
                  <TrendChart data={data.trend} label={config.trendLabel || "Patients"} />
                </Card>
              )}

              <Card title={`${config.title} list`} subtitle={loading ? "Loading…" : `${num(total)} ${total === 1 ? "patient" : "patients"}`}>
                <ReportTable
                  tableId={config.tableId}
                  columns={config.columns}
                  rows={rows}
                  loading={loading}
                  {...list.tableProps}
                  onSearchChange={undefined}
                  total={total}
                  onRowClick={(row) => router.push(`/owner/patients/${row.id}${backQuery}`)}
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
