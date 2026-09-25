"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, FilterBar, DataTable, KpiRow, ErrorState, TrendChart, InlineNotice, Badge } from "@/components/owner";
import { AiBriefPanel } from "@/components/owner/ai";
import { useAiInsight } from "@/lib/ai/client/useAiInsight";
import { useOwnerData } from "@/lib/owner/useOwnerData";
import { num } from "@/lib/owner/format";

const STAGE_LINKS = {
  leadsCreated: "/owner/leads/report",
  contacted: "/owner/leads/report?status=contacted",
  interested: "/owner/leads/interested",
  followUp: "/owner/leads/follow-ups",
  converted: "/owner/leads/report?status=converted",
  bookingDone: "/owner/patients/booking-done",
  surgeryBooked: "/owner/patients/converted",
  surgeryDone: "/owner/patients/surgery-done",
};

const BREAKDOWN_OPTIONS = [
  { value: "none", label: "No breakdown" },
  { value: "source", label: "By source" },
  { value: "agent", label: "By agent" },
  { value: "team", label: "By team" },
];

export default function StatisticsPage() {
  const router = useRouter();
  const [filterState, setFilterState] = useState(null);

  const url = useMemo(() => {
    if (!filterState) return null;
    const params = new URLSearchParams();
    params.set("dateFrom", filterState.range.from);
    params.set("dateTo", filterState.range.to);
    if (filterState.filters.breakdownBy && filterState.filters.breakdownBy !== "none") {
      params.set("breakdownBy", filterState.filters.breakdownBy);
    }
    return `/api/owner/statistics?${params.toString()}`;
  }, [filterState]);

  const { data, loading, error, isValidating, mutate: load } = useOwnerData(url);

  const aiScope = useMemo(() => {
    if (!filterState) return {};
    const s = { dateFrom: filterState.range.from, dateTo: filterState.range.to };
    if (filterState.filters.breakdownBy && filterState.filters.breakdownBy !== "none") s.breakdownBy = filterState.filters.breakdownBy;
    return s;
  }, [filterState]);
  const statsAi = useAiInsight("statistics.funnel", aiScope, { kind: "brief", enabled: !!filterState });

  // Statistics C: the stage the AI names in its top insight gets a pulsing
  // badge — match by stage label appearing in insights[0].title/detail,
  // case-insensitive; no match, no highlight.
  const aiTopInsight = statsAi.status === "ready" ? statsAi.result?.insights?.[0] : null;
  const aiFlaggedStageKey = useMemo(() => {
    if (!aiTopInsight) return null;
    const haystack = `${aiTopInsight.title || ""} ${aiTopInsight.detail || ""}`.toLowerCase();
    const hit = (data?.stages || []).find((s) => {
      const def = data?.stageDefinitions?.find((d) => d.key === s.key);
      const label = def?.label || s.key;
      return label && haystack.includes(label.toLowerCase());
    });
    return hit?.key || null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiTopInsight, data?.stages, data?.stageDefinitions]);

  const goToStage = (key) => {
    const base = STAGE_LINKS[key];
    if (!base) return;
    const f = filterState?.filters;
    const sep = base.includes("?") ? "&" : "?";
    if (!f?.range || f.range === "Today") return router.push(base);
    const q = new URLSearchParams({ range: f.range });
    if (f.range === "Custom") {
      if (f.from) q.set("from", f.from);
      if (f.to) q.set("to", f.to);
    }
    router.push(`${base}${sep}${q.toString()}`);
  };

  const stages = data?.stages || [];

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar
          title="Statistics"
          subtitle="Leads created → surgery done — the full conversion story, click a stage to drill in"
          aiState={statsAi}
          controls={
            <button className="icon-btn" onClick={() => load()} disabled={isValidating} title="Refresh">
              {isValidating ? "…" : "⟳"}
            </button>
          }
        />

        <div className="content">
          <FilterBar
            show={["date"]}
            extras={[{ key: "breakdownBy", label: "Breakdown", options: BREAKDOWN_OPTIONS }]}
            defaults={{ breakdownBy: "none" }}
            onChange={({ filters, range }) => setFilterState({ filters, range })}
          />

          <AiBriefPanel feature="statistics.funnel" scope={aiScope} title="Statistics" enabled={!!filterState} aiState={statsAi} />

          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <>
              <KpiRow
                loading={loading || !data}
                primaryIndex={0}
                items={[
                  { label: "Leads Created", value: num(data?.totalLeadsInPeriod), sub: "This period", kind: "info" },
                  {
                    label: "Overall Conversion",
                    value: stages.length ? `${stages[4]?.overallRate ?? 0}%` : "—",
                    sub: "Leads → callby-converted",
                    kind: "good",
                  },
                  {
                    label: "Surgery Done Rate",
                    value: stages.length ? `${stages[7]?.overallRate ?? 0}%` : "—",
                    sub: "Leads → surgery done",
                    kind: "good",
                  },
                ]}
              />

              {data?.truncated && (
                <InlineNotice kind="info" title="Sample capped">
                  More than {num(data.sampleSize)} leads matched this period — the funnel below is computed
                  from the first {num(data.sampleSize)} (by creation date), not the full {num(data.totalLeadsInPeriod)}.
                  Narrow the date range for an exact count.
                </InlineNotice>
              )}

              <Card title="Funnel" subtitle="Absolute count, stage-to-stage conversion, and drop-off — click a row to see the underlying list">
                <DataTable
                  tall
                  loading={loading}
                  columns={[
                    {
                      key: "label", label: "Stage",
                      render: (s) => (
                        <span>
                          {s.label}
                          <span className="muted" style={{ marginLeft: 6, fontSize: "var(--fs-12)" }}>{s.source}</span>
                          {s.key === aiFlaggedStageKey && <span className="ai-stage-flag">✦ AI: biggest leak</span>}
                        </span>
                      ),
                    },
                    { key: "value", label: "Count", align: "right", render: (s) => num(s.value) },
                    { key: "stageConversionRate", label: "Stage → Stage", align: "right", render: (s) => (s.stageConversionRate == null ? "—" : `${s.stageConversionRate}%`) },
                    { key: "dropOff", label: "Drop-off", align: "right", render: (s) => (s.dropOff == null ? "—" : <Badge kind={s.dropOff > 0 ? "bad" : "good"}>{num(s.dropOff)}</Badge>) },
                    { key: "overallRate", label: "% of Leads Created", align: "right", render: (s) => (s.overallRate == null ? "—" : `${s.overallRate}%`) },
                  ]}
                  rows={stages.map((s, i) => {
                    const def = data?.stageDefinitions?.[i];
                    return { ...s, id: s.key, label: def?.label || s.key, source: def?.source || "", rule: def?.rule || "" };
                  })}
                  onRowClick={(row) => goToStage(row.key)}
                />
              </Card>

              <Card title="Stage Definitions" subtitle="So everyone agrees what each stage means">
                <DataTable
                  columns={[
                    { key: "label", label: "Stage" },
                    { key: "source", label: "Source" },
                    { key: "rule", label: "Definition" },
                  ]}
                  rows={(data?.stageDefinitions || []).map((d, i) => ({ ...d, id: i }))}
                />
              </Card>

              <Card title="Leads Per Day" subtitle="Created vs. reached callby-converted">
                <TrendChart data={(data?.daily || []).map((d) => ({ date: d.date, value: d.leadsCreated }))} label="Leads Created" />
              </Card>

              {data?.breakdown && (
                <Card title={`Funnel by ${filterState?.filters?.breakdownBy || "dimension"}`} subtitle="Same stages, split out">
                  <DataTable
                    tall
                    loading={loading}
                    columns={[
                      { key: "key", label: filterState?.filters?.breakdownBy === "source" ? "Source" : filterState?.filters?.breakdownBy === "team" ? "Team" : "Agent" },
                      { key: "leadsCreated", label: "Created", align: "right", render: (r) => num(r.leadsCreated) },
                      { key: "interested", label: "Interested", align: "right", render: (r) => num(r.interested) },
                      { key: "converted", label: "Converted", align: "right", render: (r) => num(r.converted) },
                      { key: "bookingDone", label: "Booking Done", align: "right", render: (r) => num(r.bookingDone) },
                      { key: "surgeryDone", label: "Surgery Done", align: "right", render: (r) => num(r.surgeryDone) },
                    ]}
                    rows={data.breakdown.map((r, i) => ({ ...r, id: i }))}
                  />
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
