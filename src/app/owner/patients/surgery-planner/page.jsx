"use client";

import { useMemo, useState } from "react";
import { OwnerPage, Card, DataTable, Badge, KpiRow, ErrorState, EmptyState, Skeleton, FilterBar } from "@/components/owner";
import { AiBriefPanel } from "@/components/owner/ai";
import { useAiInsight } from "@/lib/ai/client/useAiInsight";
import { useOwnerData } from "@/lib/owner/useOwnerData";
import { fmtDate, num } from "@/lib/owner/format";
import { toISTDateKey } from "@/lib/owner/dates";

const FILTER_DEFAULTS = { range: "Next 7 Days" };

export default function SurgeryPlannerPage() {
  const [filterState, setFilterState] = useState(null);

  const branch = filterState?.filters.branch ?? "All";
  const dateRange = filterState?.filters.range ?? FILTER_DEFAULTS.range;

  const aiScope = useMemo(
    () => (filterState ? { branch, from: filterState.range.from, to: filterState.range.to } : {}),
    [filterState, branch],
  );
  const ready = !!filterState;
  const plannerAi = useAiInsight("patients.surgeryPlanner", aiScope, { kind: "brief", enabled: ready });
  const aiTopInsight = plannerAi.status === "ready" ? plannerAi.result?.insights?.[0] : null;
  const aiFlaggedDay = aiTopInsight ? `${aiTopInsight.title || ""} ${aiTopInsight.detail || ""}`.toLowerCase() : "";

  const { data, loading: fetching, error, isValidating, mutate: fetchData } = useOwnerData(
    ready ? "/api/owner/surgery-planner" : null,
    { body: aiScope },
  );
  const surgeries = data?.surgeries || [];
  const capacity = data?.todayOTCapacity || [];
  const loading = fetching || !data;

  const todayOTLoad = capacity.reduce((s, c) => s + (c.count || 0), 0);
  const graftsPlanned = surgeries.reduce((s, r) => s + (Number(r.graftsneed) || 0), 0);
  const techniqueMix = new Set(surgeries.map((r) => r.technique).filter(Boolean)).size;

  const kpiItems = [
    { label: "Scheduled surgeries", value: loading ? "—" : surgeries.length, sub: dateRange, kind: "info" },
    { label: "Today's OT load", value: loading ? "—" : todayOTLoad, sub: `${capacity.length} OT${capacity.length === 1 ? "" : "s"} in use`, kind: todayOTLoad > 0 ? "warn" : "good" },
    { label: "Grafts planned", value: loading ? "—" : num(graftsPlanned), sub: "Across the window", kind: "info" },
    { label: "Technique mix", value: loading ? "—" : techniqueMix, sub: "Distinct techniques", kind: "info" },
  ];

  return (
    <OwnerPage
      title="Surgery & OT Planner"
      subtitle="Scheduled surgeries and today's real OT load"
      aiState={plannerAi}
      controls={
        <button className="icon-btn" onClick={() => fetchData()} disabled={isValidating} title="Refresh">
          {isValidating ? "…" : "⟳"}
        </button>
      }
    >
      {/* Forward mode: this page schedules ahead rather than reporting back. */}
      <FilterBar
        mode="forward"
        defaults={FILTER_DEFAULTS}
        onChange={({ filters, range }) => setFilterState({ filters, range })}
      />

      <AiBriefPanel feature="patients.surgeryPlanner" scope={aiScope} title="Surgery & OT Planner" enabled={ready} aiState={plannerAi} />

      {error ? (
        <ErrorState message={error} onRetry={fetchData} />
      ) : (
        <>
          <KpiRow items={kpiItems} primaryIndex={0} loading={loading} />

          <Card title="Today's OT capacity" subtitle="Real count of surgeries scheduled today, by OT — not a fabricated utilization %">
            {loading ? (
              <Skeleton variant="row" count={3} style={{ height: 56, margin: "8px 0" }} />
            ) : capacity.length === 0 ? (
              <EmptyState icon="✂" title="No surgeries scheduled today" hint="Today's OT board is clear." />
            ) : (
              <div className="status-grid">
                {capacity.map((c) => (
                  <div className="status-card" key={c.OT}>
                    <strong>{c.count}</strong>
                    <span>OT {c.OT}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card
            title="Scheduled surgeries"
            subtitle={loading ? "Loading…" : `${surgeries.length} surgeries · ${dateRange}${branch !== "All" ? ` · ${branch}` : ""}`}
          >
            <DataTable
              tall
              loading={loading}
              emptyMessage={<EmptyState icon="✂" title="No surgeries in this window" hint="Pick a wider date range or another branch." />}
              columns={[
                { key: "name", label: "Patient" },
                { key: "branch", label: "Branch" },
                {
                  key: "surgeryDate", label: "Date",
                  render: (r) => {
                    const iso = r.surgeryDate ? toISTDateKey(r.surgeryDate) : "";
                    const human = fmtDate(r.surgeryDate).toLowerCase();
                    const flagged = aiFlaggedDay && ((iso && aiFlaggedDay.includes(iso)) || (human && aiFlaggedDay.includes(human)));
                    return (
                      <span>
                        {fmtDate(r.surgeryDate)}
                        {flagged && <span className="ai-stage-flag">✦ AI flagged</span>}
                      </span>
                    );
                  },
                },
                { key: "OT", label: "OT", render: (r) => (r.OT != null ? <Badge kind="info">OT {r.OT}</Badge> : "—") },
                { key: "technique", label: "Technique" },
                { key: "graftsneed", label: "Grafts needed", align: "right" },
                { key: "graftsImplanted", label: "Grafts implanted", align: "right" },
                { key: "doctor", label: "Doctor" },
                { key: "seniorTech", label: "Senior tech" },
                { key: "implanterRight", label: "Implanter R" },
                { key: "implanterLeft", label: "Implanter L" },
              ]}
              rows={loading ? [] : surgeries.map((r, i) => ({ ...r, id: r.id || r._id || i }))}
            />
          </Card>
        </>
      )}
    </OwnerPage>
  );
}
