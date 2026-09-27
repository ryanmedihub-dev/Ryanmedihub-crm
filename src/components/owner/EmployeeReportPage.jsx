"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import OwnerTopbar from "./OwnerTopbar";
import ReportPanel from "./ReportPanel";
import KpiRow from "./KpiRow";
import ErrorState from "./ErrorState";
import InlineNotice from "./InlineNotice";
import { AiBriefPanel, AiScanOverlay, aiVerdictColumn } from "./ai";
import { useAiInsight } from "@/lib/ai/client/useAiInsight";
import { useAiVerdicts } from "@/lib/ai/client/useAiVerdicts";
import { useOwnerData } from "@/lib/owner/useOwnerData";
import { rupee, num } from "@/lib/owner/format";
import { usePagedList } from "@/lib/owner/usePagedList";

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

const ADVANCED_EXTRAS = [
  {
    key: "role",
    label: "Role",
    type: "text",
    placeholder: "Role / designation",
  },
  { key: "dojFrom", label: "Joined from", type: "date" },
  { key: "dojTo", label: "Joined to", type: "date" },
  {
    key: "salaryMin",
    label: "Min salary",
    type: "number",
    placeholder: "Min salary",
  },
  {
    key: "salaryMax",
    label: "Max salary",
    type: "number",
    placeholder: "Max salary",
  },
  {
    key: "incentiveRateMin",
    label: "Min incentive rate",
    type: "number",
    placeholder: "Min incentive rate",
  },
  {
    key: "incentiveRateMax",
    label: "Max incentive rate",
    type: "number",
    placeholder: "Max incentive rate",
  },
];

const ADVANCED_DEFAULTS = {
  role: "",
  dojFrom: "",
  dojTo: "",
  salaryMin: "",
  salaryMax: "",
  incentiveRateMin: "",
  incentiveRateMax: "",
};

const TEXT_SORT_KEYS = new Set([
  "name",
  "phone",
  "email",
  "employeeId",
  "role",
  "branch",
  "tlName",
  "managerName",
  "dateOfJoining",
  "isactive",
]);
const dirForKey = (key) => (TEXT_SORT_KEYS.has(key) ? "asc" : "desc");

export default function EmployeeReportPage({ config }) {
  const router = useRouter();

  const [filterState, setFilterState] = useState(null);
  const defaultSort = config.defaultSort || "name";
  const list = usePagedList({
    defaultSort,
    defaultDir: dirForKey(defaultSort),
    dirForKey,
  });

  
  
  
  const tableScope = useMemo(() => {
    if (!filterState) return null;
    const s = { dateFrom: filterState.range.from, dateTo: filterState.range.to, ...(config.aiExtraScope || {}) };
    if (filterState.filters.branch && filterState.filters.branch !== "All") s.branch = filterState.filters.branch;
    if (filterState.filters.isactive) s.isactive = filterState.filters.isactive;
    if (filterState.filters.callbyLinked) s.callbyLinked = filterState.filters.callbyLinked;
    if (filterState.filters.q) s.search = filterState.filters.q;
    for (const ex of ADVANCED_EXTRAS) {
      const v = filterState.filters[ex.key];
      if (v) s[ex.key] = v;
    }
    return s;
  }, [filterState, config.aiExtraScope]);

  const url = useMemo(() => {
    if (!tableScope) return null;
    const params = new URLSearchParams(list.query);
    for (const [k, v] of Object.entries(tableScope)) params.set(k, v);
    return `${config.endpoint}?${params.toString()}`;
  }, [tableScope, list.query, config.endpoint]);

  const { data, loading, error, isValidating, mutate: load } = useOwnerData(url);

  const aiFeature = config.aiFeature || null;
  const aiVerdictsEnabled = aiFeature && config.aiVerdicts !== false;
  const pageAi = useAiInsight(aiFeature, tableScope || {}, { kind: "brief", enabled: !!aiFeature && !!tableScope });
  const verdicts = useAiVerdicts(
    aiFeature,
    { ...(tableScope || {}), page: list.page, pageSize: list.pageSize, sortBy: list.sortKey, sortDir: list.sortDir },
    { enabled: !!aiVerdictsEnabled && !!tableScope },
  );
  const [aiSort, setAiSort] = useState(false);

  const kpis = useMemo(
    () =>
      (data?.kpis || []).map((k) => ({
        ...k,
        value:
          k.format === "currency"
            ? rupee(k.value)
            : typeof k.value === "number"
              ? num(k.value)
              : k.value,
      })),
    [data],
  );

  const baseRows = data?.rows || [];
  
  
  const rows = aiSort
    ? [...baseRows].sort((a, b) => (verdicts.byId?.[b.id]?.score ?? -1) - (verdicts.byId?.[a.id]?.score ?? -1))
    : baseRows;
  const total = data?.total || 0;

  const columns = aiVerdictsEnabled
    ? [config.columns[0], aiVerdictColumn({ byId: verdicts.byId, loading: verdicts.loading }), ...config.columns.slice(1)]
    : config.columns;

  
  
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
          aiState={aiFeature ? pageAi : undefined}
          controls={
            <button
              className="icon-btn"
              onClick={() => load()}
              disabled={isValidating}
              title="Refresh"
            >
              {isValidating ? "…" : "⟳"}
            </button>
          }
        />

        <div className="content">
          {aiFeature && <AiBriefPanel feature={aiFeature} scope={tableScope || {}} title={config.title} enabled={!!tableScope} aiState={pageAi} />}

          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <>
              <KpiRow
                loading={loading || !data}
                items={kpis}
                primaryIndex={0}
              />

              {data?.callbyError && (
                <InlineNotice
                  kind="error"
                  title="callby data may be incomplete for this page"
                >
                  {data.callbyError}
                </InlineNotice>
              )}

              <AiScanOverlay active={aiVerdictsEnabled && verdicts.loading}>
                <ReportPanel
                  title={`${config.title} list`}
                  subtitle={
                    loading
                      ? "Loading…"
                      : `${num(total)} ${total === 1 ? "record" : "records"}`
                  }
                  show={["date", "branch"]}
                  extras={[
                    {
                      key: "isactive",
                      label: "Status",
                      options: STATUS_OPTIONS,
                    },
                    {
                      key: "callbyLinked",
                      label: "callby link",
                      options: CALLBY_LINKED_OPTIONS,
                    },
                    {
                      key: "q",
                      label: "Search",
                      type: "text",
                      placeholder: "Name / phone / email / ID / TL / manager",
                    },
                  ]}
                  advancedExtras={ADVANCED_EXTRAS}
                  defaults={{
                    ...(config.defaultRange ? { range: config.defaultRange } : {}),
                    isactive: "true",
                    callbyLinked: "",
                    q: "",
                    ...ADVANCED_DEFAULTS,
                  }}
                  onChange={({ filters, range }) => {
                    list.resetPage();
                    setFilterState({ filters, range });
                  }}
                  toolbar={
                    aiVerdictsEnabled && (
                      <button
                        type="button"
                        className={`ai-ghost-btn${aiSort ? " ai-cmdbar-item-active" : ""}`}
                        onClick={() => setAiSort((s) => !s)}
                        title="Sorts the rows on this page only by AI score — the server-side sort is unchanged"
                      >
                        ↕ Sort by AI score (this page)
                      </button>
                    )
                  }
                  tableId={config.tableId}
                  columns={columns}
                  rows={rows}
                  loading={loading}
                  {...list.tableProps}
                  onSearchChange={undefined}
                  total={total}
                  onRowClick={(row) =>
                    router.push(`${config.detailBase}/${row.id}${detailQuery}`)
                  }
                  csvFilename={`${config.tableId}.csv`}
                />
              </AiScanOverlay>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
