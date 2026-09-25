"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, DataTable, KpiRow, ErrorState, EmptyState } from "@/components/owner";
import { AiBriefPanel, AiScanOverlay, aiVerdictColumn } from "@/components/owner/ai";
import { useAiInsight } from "@/lib/ai/client/useAiInsight";
import { useAiVerdicts } from "@/lib/ai/client/useAiVerdicts";
import { ownerFetch } from "@/lib/ownerFetch";
import { rupee, num as fmt } from "@/lib/owner/format";
import { OWNER_BRANCHES as BRANCHES, DATE_RANGES, buildDateRange } from "@/lib/owner/filters";

export default function CounsellorConversionPage() {
  const [branch, setBranch]       = useState("All");
  const [dateRange, setDateRange] = useState("Last 30 Days");
  const [custom, setCustom]       = useState({ from: "", to: "" });

  const [rows, setRows]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const dateReady = !(dateRange === "Custom" && !custom.from);
  const aiScope = useMemo(() => {
    if (!dateReady) return {};
    const { from, to } = buildDateRange(dateRange, custom);
    return { branch, from, to };
  }, [dateReady, dateRange, custom, branch]);
  const convAi = useAiInsight("patients.counsellorConversion", aiScope, { kind: "brief", enabled: dateReady });
  const verdicts = useAiVerdicts("patients.counsellorConversion", aiScope, { enabled: dateReady });

  const fetchData = useCallback(async ({ signal } = {}) => {
    if (dateRange === "Custom" && !custom.from) return;
    setLoading(true);
    setError(null);
    const { from, to } = buildDateRange(dateRange, custom);
    const r = await ownerFetch("/api/owner/counsellor-conversion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branch, from, to }),
      signal,
    });
    if (r.aborted) return;
    if (r.ok) setRows(r.data?.rows || []);
    else setError(r.error);
    setLoading(false);
  }, [branch, dateRange, custom]);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchData({ signal: ctrl.signal });
    return () => ctrl.abort();
  }, [fetchData]);

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
    <div className="app">
      <OwnerSidebar />

      <div className="main">
        <OwnerTopbar
          title="Counsellor Conversion"
          subtitle="Per-counsellor pipeline: visits, plans, tokens, surgeries, revenue, discounting"
          aiState={convAi}
          controls={
            <>
              <select className="control" value={branch} onChange={(e) => setBranch(e.target.value)}>
                {BRANCHES.map((b) => <option key={b}>{b}</option>)}
              </select>
              <select className="control" value={dateRange} onChange={(e) => setDateRange(e.target.value)}>
                {DATE_RANGES.map((r) => <option key={r}>{r}</option>)}
              </select>
              {dateRange === "Custom" && (
                <>
                  <input type="date" className="control" value={custom.from} onChange={(e) => setCustom((p) => ({ ...p, from: e.target.value }))} />
                  <input type="date" className="control" value={custom.to} onChange={(e) => setCustom((p) => ({ ...p, to: e.target.value }))} />
                </>
              )}
              <button className="icon-btn" onClick={fetchData} disabled={loading} title="Refresh">
                {loading ? "…" : "⟳"}
              </button>
            </>
          }
        />

        <div className="content">
          <AiBriefPanel feature="patients.counsellorConversion" scope={aiScope} title="Counsellor Conversion" enabled={dateReady} aiState={convAi} />

          {error ? (
            <ErrorState message={error} onRetry={fetchData} />
          ) : (
            <>
              <KpiRow
                primaryIndex={4}
                loading={loading}
                items={[
                  { label: "Total Visits", value: fmt(totals.visits), sub: dateRange, kind: "info" },
                  { label: "Plans Given", value: fmt(totals.plans), sub: "Final package set", kind: "info" },
                  { label: "Tokens Collected", value: fmt(totals.tokens), sub: "Amount received > 0", kind: "good" },
                  { label: "Surgeries", value: fmt(totals.surgeries), sub: "Closed", kind: "good" },
                  { label: "Total Revenue", value: rupee(totals.revenue), sub: "All counsellors", kind: "good" },
                  { label: "Counsellors", value: fmt(rows.length), sub: "Active this period", kind: "info" },
                ]}
              />

              <Card title="Counsellor breakdown" subtitle={loading ? "Loading…" : `${rows.length} counsellors`}>
                <AiScanOverlay active={verdicts.loading}>
                <DataTable
                  tall
                  loading={loading}
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
                  rows={loading ? [] : rows.map((r) => ({ ...r, id: r.counsellorId }))}
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
