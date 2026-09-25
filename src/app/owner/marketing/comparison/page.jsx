"use client";

import { useMemo, useState } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, FilterBar, DataTable, Badge, ErrorState, TrendChart, InlineNotice, ManualDataNotice } from "@/components/owner";
import { AiBriefPanel } from "@/components/owner/ai";
import { useAiInsight } from "@/lib/ai/client/useAiInsight";
import { useOwnerData } from "@/lib/owner/useOwnerData";
import { rupee, num, roasFmt } from "@/lib/owner/format";

const METRICS = [
  { key: "spend", label: "Spend", format: "rupee" },
  { key: "clicks", label: "Clicks", format: "num", note: "blank = not entered" },
  { key: "leads", label: "Leads", format: "num" },
  { key: "cpl", label: "CPL", format: "rupee" },
  { key: "cpc", label: "CPC", format: "rupee" },
  { key: "converted", label: "Converted", format: "num" },
  { key: "revenue", label: "Revenue", format: "rupee" },
  { key: "cac", label: "CAC", format: "rupee" },
  { key: "roas", label: "ROAS", format: "roas" },
];

function fmtMetric(format, value) {
  if (value == null) return "—";
  if (format === "rupee") return rupee(value);
  if (format === "roas") return roasFmt(value);
  return num(value);
}

function Delta({ current, previous, higherIsBetter = true }) {
  if (current == null || previous == null || previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 1000) / 10;
  if (pct === 0) return <span className="muted"> · flat</span>;
  const improving = higherIsBetter ? pct > 0 : pct < 0;
  return (
    <span style={{ color: improving ? "var(--pos)" : "var(--crit)", fontSize: "var(--fs-12)" }}>
      {" "}· {pct > 0 ? "+" : ""}{pct}% vs prior period
    </span>
  );
}

const LOWER_IS_BETTER = new Set(["spend", "cpl", "cpc", "cac"]);

export default function MarketingComparisonPage() {
  const [filterState, setFilterState] = useState(null);

  const aiScope = useMemo(() => {
    if (!filterState) return {};
    const s = { dateFrom: filterState.range.from, dateTo: filterState.range.to };
    if (filterState.filters.branch && filterState.filters.branch !== "All") s.branch = filterState.filters.branch;
    return s;
  }, [filterState]);

  const url = useMemo(() => {
    if (!filterState) return null;
    return `/api/owner/marketing/comparison?${new URLSearchParams(aiScope).toString()}`;
  }, [filterState, aiScope]);

  const { data, loading, error, isValidating, mutate: load } = useOwnerData(url);
  const comparisonAi = useAiInsight("marketing.comparison", aiScope, { kind: "brief", enabled: !!filterState });

  // "AI pick" crown — only if the brief's headline explicitly names a
  // platform, never inferred from the numbers ourselves. A head-to-head
  // headline often names both ("Google is outpacing Meta on ROAS"); the one
  // named FIRST is read as the subject/favoured platform. Neither or both
  // absent (or a tie in position) → no badge.
  const aiPickHeadline = comparisonAi.status === "ready" ? (comparisonAi.result?.headline || "").toLowerCase() : "";
  const metaAt = aiPickHeadline.indexOf("meta");
  const googleAt = aiPickHeadline.indexOf("google");
  const aiPickPlatform = metaAt === -1 && googleAt === -1 ? null
    : metaAt === -1 ? "Google"
    : googleAt === -1 ? "Meta"
    : metaAt < googleAt ? "Meta" : "Google";

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar
          title="Meta vs Google"
          subtitle="Side-by-side comparison for the period — evidence only, no recommendation"
          aiState={comparisonAi}
          controls={
            <button className="icon-btn" onClick={() => load()} disabled={isValidating} title="Refresh">
              {isValidating ? "…" : "⟳"}
            </button>
          }
        />

        <div className="content">
          <AiBriefPanel feature="marketing.comparison" scope={aiScope} title="Meta vs Google" enabled={!!filterState} aiState={comparisonAi} />

          <ManualDataNotice />

          <FilterBar show={["date", "branch"]} onChange={({ filters, range }) => setFilterState({ filters, range })} />

          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : !data ? null : (
            <>
              <InlineNotice kind="info" title="Connect rate not shown">
                There is no callby endpoint that looks up calls by a list of phone numbers, so
                connect rate for platform-sourced leads can&apos;t be derived without a new
                cross-repo endpoint — omitted rather than faked.
              </InlineNotice>

              <Card title="This period vs. the immediately preceding, equal-length period">
                <div className="grid cols-equal">
                  {["Meta", "Google"].map((platform) => {
                    const cur = data.current?.[platform] || {};
                    const prev = data.previous?.[platform] || {};
                    return (
                      <div key={platform}>
                        <p style={{ fontWeight: 700, marginBottom: 8 }}>
                          <Badge kind={platform === "Meta" ? "purple" : "info"}>{platform}</Badge>
                          {aiPickPlatform === platform && <span className="ai-model-chip" style={{ marginLeft: 8 }}>👑 AI pick</span>}
                        </p>
                        {METRICS.map((m) => (
                          <div key={m.key} className="metric-row">
                            <span>{m.label}</span>
                            <div />
                            <strong>
                              {fmtMetric(m.format, cur[m.key])}
                              <Delta current={cur[m.key]} previous={prev[m.key]} higherIsBetter={!LOWER_IS_BETTER.has(m.key)} />
                            </strong>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card title="Spend Per Day" subtitle="Meta vs Google">
                <TrendChart
                  data={(data.daily || []).map((d) => ({ date: d.date, value: d.Meta || 0 }))}
                  label="Meta Spend"
                />
                <p className="muted" style={{ marginTop: 8, fontSize: "var(--fs-12)" }}>
                  Showing Meta spend; see the per-day table below for both platforms side by side.
                </p>
                <DataTable
                  columns={[
                    { key: "date", label: "Date" },
                    { key: "Meta", label: "Meta Spend", align: "right", render: (r) => rupee(r.Meta) },
                    { key: "Google", label: "Google Spend", align: "right", render: (r) => rupee(r.Google) },
                  ]}
                  rows={(data.daily || []).map((d, i) => ({ ...d, id: i }))}
                />
              </Card>

              <Card title="By Branch" subtitle={data.note}>
                <DataTable
                  columns={[
                    { key: "branch", label: "Branch" },
                    { key: "Meta", label: "Meta Spend", align: "right", render: (r) => rupee(r.Meta) },
                    { key: "Google", label: "Google Spend", align: "right", render: (r) => rupee(r.Google) },
                  ]}
                  rows={(data.byBranch || []).map((b, i) => ({ ...b, id: i }))}
                />
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
