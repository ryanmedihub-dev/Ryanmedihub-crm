"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, FilterBar, KpiRow, TrendChart, ErrorState, ManualDataNotice } from "@/components/owner";
import { AiBriefPanel } from "@/components/owner/ai";
import { useAiInsight } from "@/lib/ai/client/useAiInsight";
import { ownerFetch } from "@/lib/ownerFetch";
import { rupee, num, roasFmt } from "@/lib/owner/format";

const LINKS = [
  { href: "/owner/marketing/campaigns", label: "Active Ads", note: "Campaign CRUD, targeting, budgets" },
  { href: "/owner/marketing/ad-spend", label: "Ad Spend Entry", note: "Hand-enter daily spend + return picture" },
  { href: "/owner/marketing/platforms", label: "Meta & Google", note: "CPL, CAC, ROAS by platform and campaign" },
  { href: "/owner/marketing/comparison", label: "Meta vs Google", note: "Side-by-side comparison + trend" },
];

export default function MarketingLanding() {
  const [filterState, setFilterState] = useState(null);
  const [summary, setSummary] = useState(null);
  const [daily, setDaily] = useState([]);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const aiScope = filterState ? { branch: filterState.filters.branch || "All", from: filterState.range.from, to: filterState.range.to } : {};
  const overviewAi = useAiInsight("marketing.overview", aiScope, { kind: "brief", enabled: !!filterState });

  const load = useCallback(
    async ({ signal } = {}) => {
      if (!filterState) return;
      setLoading(true);
      setError(null);
      const { from, to } = filterState.range;
      const branch = filterState.filters.branch || "All";

      const [summaryResult, comparisonResult] = await Promise.all([
        ownerFetch("/api/owner/marketing-summary", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ branch, from, to }), signal,
        }),
        ownerFetch(`/api/owner/marketing/comparison?dateFrom=${encodeURIComponent(from)}&dateTo=${encodeURIComponent(to)}&branch=${encodeURIComponent(branch)}`, { signal }),
      ]);
      if (summaryResult.aborted) return;
      if (summaryResult.ok) {
        setSummary(summaryResult.data);
        setNotice({ lastUpdatedAt: summaryResult.data?.lastUpdatedAt, lastUpdatedBy: summaryResult.data?.lastUpdatedBy });
      } else {
        setError(summaryResult.error);
      }
      if (comparisonResult.ok) setDaily(comparisonResult.data?.daily || []);
      setLoading(false);
    },
    [filterState],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load({ signal: ctrl.signal });
    return () => ctrl.abort();
  }, [load]);

  const totals = (summary?.rows || []).reduce(
    (acc, r) => {
      const isTotal = r.isPlatformTotal || (summary.rows.filter((x) => x.platform === r.platform).length === 1);
      if (!isTotal) return acc;
      return {
        spend: acc.spend + (r.spend || 0),
        leads: acc.leads + (r.leads || 0),
        converted: acc.converted + (r.converted || 0),
        revenue: acc.revenue + (r.revenue || 0),
      };
    },
    { spend: 0, leads: 0, converted: 0, revenue: 0 },
  );

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar
          title="Marketing"
          subtitle="Spend, leads, CPL, CAC and ROAS by platform — links into every marketing page"
          aiState={overviewAi}
          controls={
            <button className="icon-btn" onClick={() => load()} disabled={loading} title="Refresh">
              {loading ? "…" : "⟳"}
            </button>
          }
        />

        <div className="content">
          <AiBriefPanel feature="marketing.overview" scope={aiScope} title="Marketing" enabled={!!filterState} aiState={overviewAi} />

          <ManualDataNotice lastUpdatedAt={notice?.lastUpdatedAt} lastUpdatedBy={notice?.lastUpdatedBy} />

          <FilterBar show={["date", "branch"]} onChange={({ filters, range }) => setFilterState({ filters, range })} />

          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <>
              <KpiRow
                loading={loading || !summary}
                primaryIndex={0}
                items={[
                  { label: "Total Spend", value: rupee(totals.spend), sub: "This period", kind: "info" },
                  { label: "Total Leads", value: num(totals.leads), sub: "Meta + Google", kind: "info" },
                  { label: "Blended CPL", value: rupee(totals.leads ? totals.spend / totals.leads : null), sub: "Cost per lead", kind: "good" },
                  { label: "Converted", value: num(totals.converted), sub: "So far", kind: "good" },
                  { label: "Blended CAC", value: rupee(totals.converted ? totals.spend / totals.converted : null), sub: "Cost per conversion", kind: "warn" },
                  { label: "Blended ROAS", value: roasFmt(totals.spend ? totals.revenue / totals.spend : null), sub: "Revenue ÷ spend", kind: "good" },
                ]}
              />

              <Card title="Spend Per Day" subtitle="Meta + Google, this period">
                <TrendChart
                  data={daily.map((d) => ({ date: d.date, value: (d.Meta || 0) + (d.Google || 0) }))}
                  label="Spend"
                />
              </Card>

              <Card title="Jump to a page">
                <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
                  {LINKS.map((it) => (
                    <Link key={it.href} href={it.href} className="card" style={{ display: "block", textDecoration: "none" }}>
                      <div className="card-title">
                        <div>
                          <h3>{it.label}</h3>
                          <p>{it.note}</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
