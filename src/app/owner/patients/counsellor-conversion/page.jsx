"use client";

import { useMemo, useState } from "react";
import { OwnerPage, Card, DataTable, KpiRow, ErrorState, EmptyState, FilterBar } from "@/components/owner";
import { AiBriefPanel, AiScanOverlay, aiVerdictColumn } from "@/components/owner/ai";
import { useAiInsight } from "@/lib/ai/client/useAiInsight";
import { useAiVerdicts } from "@/lib/ai/client/useAiVerdicts";
import { useOwnerData } from "@/lib/owner/useOwnerData";
import { rupee, num as fmt } from "@/lib/owner/format";

const FILTER_DEFAULTS = { range: "Last 30 Days" };

export default function CounsellorConversionPage() {
  const [filterState, setFilterState] = useState(null);

  const branch = filterState?.filters.branch ?? "All";
  const dateRange = filterState?.filters.range ?? FILTER_DEFAULTS.range;

  const aiScope = useMemo(
    () => (filterState ? { branch, from: filterState.range.from, to: filterState.range.to } : {}),
    [filterState, branch],
  );
  const ready = !!filterState;
  const convAi = useAiInsight("patients.counsellorConversion", aiScope, { kind: "brief", enabled: ready });
  const verdicts = useAiVerdicts("patients.counsellorConversion", aiScope, { enabled: ready });

  const { data, loading, error, isValidating, mutate: fetchData } = useOwnerData(
    ready ? "/api/owner/counsellor-conversion" : null,
    { body: aiScope },
  );
  const rows = data?.rows || [];
  // Also "busy" before the filters resolve, so the first paint is a skeleton
  // rather than an empty table.
  const busy = loading || !data;

  const totals = rows.reduce(
    (acc, r) => ({
      visits: acc.visits + (r.visits || 0),
      plans: acc.plans + (r.plans || 0),
      tokens: acc.tokens + (r.tokens || 0),
      surgeries: acc.surgeries + (r.surgeries || 0),
      revenue: acc.revenue + (r.revenue || 0),
    }),
    { visits: 0, plans: 0, tokens: 0, surgeries: 0, revenue: 0 }
  );

  return (
    <OwnerPage
      title="Counsellor Conversion"
      subtitle="Per-counsellor pipeline: visits, plans, tokens, surgeries, revenue, discounting"
      aiState={convAi}
      controls={
        <button className="icon-btn" onClick={() => fetchData()} disabled={isValidating} title="Refresh">
          {isValidating ? "…" : "⟳"}
        </button>
      }
    >
      <FilterBar
        defaults={FILTER_DEFAULTS}
        onChange={({ filters, range }) => setFilterState({ filters, range })}
      />

      <AiBriefPanel feature="patients.counsellorConversion" scope={aiScope} title="Counsellor Conversion" enabled={ready} aiState={convAi} />

      {error ? (
        <ErrorState message={error} onRetry={fetchData} />
      ) : (
        <>
          <KpiRow
            primaryIndex={4}
            loading={busy}
            items={[
              { label: "Total Visits", value: fmt(totals.visits), sub: dateRange, kind: "info" },
              { label: "Plans Given", value: fmt(totals.plans), sub: "Final package set", kind: "info" },
              { label: "Tokens Collected", value: fmt(totals.tokens), sub: "Amount received > 0", kind: "good" },
              { label: "Surgeries", value: fmt(totals.surgeries), sub: "Closed", kind: "good" },
              { label: "Total Revenue", value: rupee(totals.revenue), sub: "All counsellors", kind: "good" },
              { label: "Counsellors", value: fmt(rows.length), sub: "Active this period", kind: "info" },
            ]}
          />

          <Card title="Counsellor breakdown" subtitle={busy ? "Loading…" : `${rows.length} counsellors`}>
            <AiScanOverlay active={verdicts.loading}>
            <DataTable
              tall
              loading={busy}
              emptyMessage={<EmptyState icon="❝" title="No counselling activity" hint="No visits, plans or tokens recorded in this period." />}
              columns={[
                { key: "counsellorName", label: "Counsellor" },
                aiVerdictColumn({ byId: verdicts.byId, loading: verdicts.loading }),
                { key: "visits", label: "Visits", align: "right" },
                { key: "plans", label: "Plans", align: "right" },
                { key: "tokens", label: "Tokens", align: "right" },
                { key: "surgeries", label: "Surgeries", align: "right" },
                { key: "revenue", label: "Revenue", align: "right", render: (r) => rupee(r.revenue) },
                { key: "avgDiscount", label: "Avg discount", align: "right", render: (r) => rupee(r.avgDiscount) },
              ]}
              rows={busy ? [] : rows.map((r) => ({ ...r, id: r.counsellorId }))}
            />
            </AiScanOverlay>
          </Card>
        </>
      )}
    </OwnerPage>
  );
}
