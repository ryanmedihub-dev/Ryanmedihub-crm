"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import OwnerTopbar from "./OwnerTopbar";
import ReportPanel from "./ReportPanel";
import KpiRow from "./KpiRow";
import ErrorState from "./ErrorState";
import InlineNotice from "./InlineNotice";
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

  const url = useMemo(() => {
    if (!filterState) return null;
    const params = new URLSearchParams(list.query);
    params.set("dateFrom", filterState.range.from);
    params.set("dateTo", filterState.range.to);
    if (filterState.filters.branch && filterState.filters.branch !== "All") {
      params.set("branch", filterState.filters.branch);
    }
    if (filterState.filters.isactive)
      params.set("isactive", filterState.filters.isactive);
    if (filterState.filters.callbyLinked)
      params.set("callbyLinked", filterState.filters.callbyLinked);
    if (filterState.filters.q) params.set("search", filterState.filters.q);
    for (const ex of ADVANCED_EXTRAS) {
      const v = filterState.filters[ex.key];
      if (v) params.set(ex.key, v);
    }
    return `${config.endpoint}?${params.toString()}`;
  }, [filterState, list.query, config.endpoint]);

  const { data, loading, error, isValidating, mutate: load } = useOwnerData(url);

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
                  isactive: "true",
                  callbyLinked: "",
                  q: "",
                  ...ADVANCED_DEFAULTS,
                }}
                onChange={({ filters, range }) => {
                  list.resetPage();
                  setFilterState({ filters, range });
                }}
                tableId={config.tableId}
                columns={config.columns}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
