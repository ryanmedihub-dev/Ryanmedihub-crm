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
import { AiBriefPanel, AiScanOverlay, aiVerdictColumn } from "./ai";
import { useAiInsight } from "@/lib/ai/client/useAiInsight";
import { useAiVerdicts } from "@/lib/ai/client/useAiVerdicts";
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

  // The table's filters minus page/pageSize/sort/search — what an AI brief
  // analyses (the whole filtered cohort). Verdicts extend this with the
  // table's exact visible page/sort, same pattern as Part 4's Employees.
  const aiScope = useMemo(() => {
    if (!filterState) return null;
    const s = { preset: config.preset, dateFrom: filterState.range.from, dateTo: filterState.range.to };
    if (filterState.filters.branch && filterState.filters.branch !== "All") s.branch = filterState.filters.branch;
    for (const ex of extras) {
      const v = filterState.filters[ex.key];
      if (v && v !== "all") s[ex.key] = v;
    }
    return s;
  }, [filterState, config.preset, extras]);

  const url = useMemo(() => {
    if (!filterState || !aiScope) return null;
    const params = new URLSearchParams(list.query);
    for (const [k, v] of Object.entries(aiScope)) params.set(k, v);
    if (filterState.filters.q) params.set("search", filterState.filters.q);
    return `/api/owner/patients?${params.toString()}`;
  }, [filterState, aiScope, list.query]);

  const { data, loading, error, isValidating, mutate: load } = useOwnerData(url);

  const aiFeature = config.aiFeature || null;
  const aiVerdictsEnabled = aiFeature && config.aiVerdicts;
  const pageAi = useAiInsight(aiFeature, aiScope || {}, { kind: "brief", enabled: !!aiFeature && !!aiScope });
  const verdicts = useAiVerdicts(
    aiFeature,
    { ...(aiScope || {}), page: list.page, pageSize: list.pageSize, sortBy: list.sortKey, sortDir: list.sortDir },
    { enabled: !!aiVerdictsEnabled && !!aiScope },
  );

  const kpis = useMemo(() => (data ? config.kpis(data) : []), [data, config]);
  const rows = data?.rows || [];
  const total = data?.total || 0;
  const columns = aiVerdictsEnabled
    ? [config.columns[0], aiVerdictColumn({ byId: verdicts.byId, loading: verdicts.loading, labelSet: "followUp" }), ...config.columns.slice(1)]
    : config.columns;

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
          aiState={aiFeature ? pageAi : undefined}
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

          {aiFeature && <AiBriefPanel feature={aiFeature} scope={aiScope || {}} title={config.title} enabled={!!aiScope} aiState={pageAi} />}

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
                <AiScanOverlay active={aiVerdictsEnabled && verdicts.loading}>
                <ReportTable
                  tableId={config.tableId}
                  columns={columns}
                  rows={rows}
                  loading={loading}
                  {...list.tableProps}
                  onSearchChange={undefined}
                  total={total}
                  onRowClick={(row) => router.push(`/owner/patients/${row.id}${backQuery}`)}
                  csvFilename={`patients-${config.preset}.csv`}
                />
                </AiScanOverlay>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
