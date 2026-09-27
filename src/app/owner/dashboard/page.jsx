"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import {
  OwnerTopbar, KpiRow, Card, Funnel, DataTable, ErrorState, EmptyState,
  AttentionRamp, Skeleton, Badge,
} from "@/components/owner";
import { AiBriefPanel, AiFeedTicker } from "@/components/owner/ai";
import { useAiInsight } from "@/lib/ai/client/useAiInsight";
import { useOwnerData } from "@/lib/owner/useOwnerData";
import { rupee, num as fmt } from "@/lib/owner/format";
import { OWNER_BRANCHES as BRANCHES, DATE_RANGES, buildDateRange } from "@/lib/owner/filters";

function fmtChartDate(iso) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function popChange(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

const RULE_LEVEL = { overdueFollowUps: 2, interestedNoCall: 3, bookingDoneStale: 3, surgeryBookedStale: 4 };

export default function OwnerDashboard() {
  const router = useRouter();
  const [branch, setBranch] = useState("All");
  const [dateRange, setDateRange] = useState("Today");
  const [custom, setCustom] = useState({ from: "", to: "" });

  
  const dateReady = !(dateRange === "Custom" && !custom.from);
  const bq = branch !== "All" ? `&branch=${encodeURIComponent(branch)}` : "";
  const bqOnly = branch !== "All" ? `?branch=${encodeURIComponent(branch)}` : "";

  const resolvedDates = useMemo(() => (dateReady ? buildDateRange(dateRange, custom) : null), [dateReady, dateRange, custom]);

  const dashUrl = useMemo(() => {
    if (!resolvedDates) return null;
    const { from, to } = resolvedDates;
    return `/api/owner/dashboard?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${bq}`;
  }, [resolvedDates, bq]);
  const { data, loading, error, isValidating: dashValidating, mutate: loadDash } = useOwnerData(dashUrl);

  const recUrl = dateReady ? `/api/receivables/summary${bqOnly}` : null;
  const payUrl = dateReady ? `/api/payables/summary${bqOnly}` : null;
  const { data: recData, loading: recLoading, isValidating: recValidating, mutate: loadRec } = useOwnerData(recUrl);
  const { data: payData, loading: payLoading, isValidating: payValidating, mutate: loadPay } = useOwnerData(payUrl);

  const finance = { receivable: recData?.overall ?? null, payable: payData?.overall ?? null };
  const financeLoading = recLoading || payLoading;
  const isValidating = dashValidating || recValidating || payValidating;
  const fetchAll = () => { loadDash(); loadRec(); loadPay(); };

  
  
  const aiScope = useMemo(
    () => (resolvedDates ? { branch, from: resolvedDates.from, to: resolvedDates.to } : {}),
    [resolvedDates, branch],
  );
  const dashboardAi = useAiInsight("dashboard.command", aiScope, { kind: "brief", enabled: !!resolvedDates });

  const revenue = data?.revenue || {};
  const surgeries = data?.surgeries || {};
  const funnel = data?.funnel || {};
  const attention = data?.attention || {};
  const performers = data?.performers || {};

  const revenueChange = popChange(revenue.current, revenue.previous);
  const surgeriesChange = popChange(surgeries.current, surgeries.previous);

  const converted = funnel.stages?.find((s) => s.key === "converted");
  const leadsCreated = funnel.stages?.find((s) => s.key === "leadsCreated");
  const conversionPct = converted?.overallRate ?? null;

  const kpiItems = [
    {
      label: "Total Revenue",
      value: loading ? "—" : rupee(revenue.current),
      rawValue: loading ? null : revenue.current, format: "rupee",
      sub: loading ? "" : revenueChange == null ? `${dateRange}${branch !== "All" ? ` · ${branch}` : ""}` : `${revenueChange >= 0 ? "▲" : "▼"} ${Math.abs(revenueChange)}% vs previous period`,
      kind: revenueChange == null ? "good" : revenueChange >= 0 ? "good" : "bad",
      onDrill: () => router.push("/owner/finance/transactions"),
    },
    { label: "Leads Created", value: loading ? "—" : fmt(leadsCreated?.value), rawValue: loading ? null : leadsCreated?.value, format: "num", sub: dateRange, kind: "info" },
    { label: "Conversion Rate", value: loading ? "—" : conversionPct == null ? "—" : `${conversionPct}%`, sub: "Leads → Converted (see Statistics)", kind: conversionPct >= 20 ? "good" : "warn" },
    {
      label: "Surgeries Done",
      value: loading ? "—" : fmt(surgeries.current),
      rawValue: loading ? null : surgeries.current, format: "num",
      sub: loading || surgeriesChange == null ? "This period" : `${surgeriesChange >= 0 ? "▲" : "▼"} ${Math.abs(surgeriesChange)}% vs previous period`,
      kind: "good",
    },
    { label: "Pending Receivable", value: financeLoading ? "—" : rupee(finance?.receivable?.totalPending), rawValue: financeLoading ? null : finance?.receivable?.totalPending, format: "rupee", sub: financeLoading ? "" : `${fmt(finance?.receivable?.count ?? 0)} open`, kind: "info" },
    { label: "Pending Payable", value: financeLoading ? "—" : rupee(finance?.payable?.totalPending), rawValue: financeLoading ? null : finance?.payable?.totalPending, format: "rupee", sub: financeLoading ? "" : `${fmt(finance?.payable?.count ?? 0)} open`, kind: finance?.payable?.totalPending > 0 ? "bad" : "good" },
  ];

  const attentionRules = attention.rules || [];
  const branchRevenue = revenue.byBranch || [];
  const maxBranchRevenue = Math.max(1, ...branchRevenue.map((b) => b.revenue || 0));

  return (
    <div className="app">
      <OwnerSidebar />

      <div className="main">
        <OwnerTopbar
          title="Dashboard"
          subtitle={`Everything below links deeper · ${branch === "All" ? "All branches" : branch}`}
          aiState={dashboardAi}
          controls={
            <>
              <select className="control" value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Branch">
                {BRANCHES.map((b) => <option key={b}>{b}</option>)}
              </select>
              <select className="control" value={dateRange} onChange={(e) => setDateRange(e.target.value)} aria-label="Date range">
                {DATE_RANGES.map((r) => <option key={r}>{r}</option>)}
              </select>
              {dateRange === "Custom" && (
                <>
                  <input type="date" className="control" value={custom.from} onChange={(e) => setCustom((p) => ({ ...p, from: e.target.value }))} aria-label="From date" />
                  <input type="date" className="control" value={custom.to} onChange={(e) => setCustom((p) => ({ ...p, to: e.target.value }))} aria-label="To date" />
                </>
              )}
              <button className="icon-btn" onClick={() => fetchAll()} disabled={isValidating} title="Refresh">
                {isValidating ? "…" : "⟳"}
              </button>
            </>
          }
        />

        <div className="content">
          <AiBriefPanel
            feature="dashboard.command"
            scope={aiScope}
            title="Dashboard"
            variant="hero"
            enabled={!!resolvedDates}
            aiState={dashboardAi}
          />
          <AiFeedTicker />

          {error ? (
            <ErrorState message={error} onRetry={fetchAll} />
          ) : (
            <>
              <KpiRow items={kpiItems} primaryIndex={0} loading={loading || financeLoading} />

              <Card
                title="Attention"
                subtitle={loading ? "Loading…" : `${fmt(attention.totalFlagged)} items flagged${attention.totalValueAtRisk ? ` · ${rupee(attention.totalValueAtRisk)} at risk` : ""} — threshold rules, no AI`}
                actions={<Link href="/owner/ai/attention" className="btn" style={{ textDecoration: "none" }}>Open Attention →</Link>}
              >
                {loading ? (
                  <Skeleton variant="row" count={4} style={{ height: 32, margin: "8px 0" }} />
                ) : attentionRules.every((r) => r.count === 0) ? (
                  <EmptyState icon="✓" title="Nothing flagged" hint="No Attention rule tripped for this scope right now." />
                ) : (
                  <div className="grid cols-equal">
                    {attentionRules.map((r) => (
                      <div
                        key={r.key}
                        className="decision-card warn"
                        role="button"
                        tabIndex={0}
                        onClick={() => router.push("/owner/ai/attention")}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push("/owner/ai/attention"); } }}
                        style={{ cursor: "pointer" }}
                      >
                        <AttentionRamp level={r.error ? 0 : RULE_LEVEL[r.key] || 2} label={r.error ? "Unavailable" : `${r.count}`} />
                        <h4>{r.label}</h4>
                        <p>{r.error ? r.error : r.valueAtRisk ? `${rupee(r.valueAtRisk)} pending` : `${fmt(r.count)} flagged`}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <div className="grid cols-2">
                <Card title="Revenue Trend" subtitle={`${dateRange}${branch !== "All" ? ` · ${branch}` : ""} — reuses the Finance section's own revenue filter`}>
                  {loading ? (
                    <Skeleton variant="chart" />
                  ) : revenue.perDay?.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={revenue.perDay} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="ownerRevGrad2" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--ai-cyan)" stopOpacity={0.28} />
                            <stop offset="95%" stopColor="var(--ai-cyan)" stopOpacity={0} />
                          </linearGradient>
                          <filter id="ownerRevGlow" x="-20%" y="-40%" width="140%" height="180%">
                            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="var(--ai-cyan)" floodOpacity="0.5" />
                          </filter>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                        <XAxis dataKey="date" tickFormatter={fmtChartDate} tick={{ fontSize: 12, fill: "var(--ink-muted)" }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={(v) => (v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : `₹${(v / 1000).toFixed(0)}k`)} tick={{ fontSize: 12, fill: "var(--ink-muted)" }} axisLine={false} tickLine={false} width={54} />
                        <Tooltip formatter={(v) => [rupee(v), "Revenue"]} labelFormatter={(l) => new Date(l).toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long" })} contentStyle={{ borderRadius: "12px", border: "1px solid var(--line)", fontSize: "13px", background: "var(--surface)", color: "var(--ink)" }} />
                        <Area type="monotone" dataKey="total" stroke="var(--ai-cyan)" strokeWidth={2.5} fill="url(#ownerRevGrad2)" filter="url(#ownerRevGlow)" isAnimationActive dot={{ r: 3, fill: "var(--ai-cyan)", strokeWidth: 0 }} activeDot={{ r: 5, fill: "var(--ai-cyan)" }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState icon="₹" title="No revenue in this period" hint="Try a wider date range." />
                  )}
                </Card>

                <Card title="Conversion Funnel" subtitle="Compact view — see Statistics for the full breakdown" actions={<Link href="/owner/statistics" className="btn" style={{ textDecoration: "none" }}>Open →</Link>}>
                  {loading ? (
                    <Skeleton variant="chart" />
                  ) : funnel.error ? (
                    <EmptyState icon="⚠" title="Funnel unavailable" hint={funnel.error} />
                  ) : (
                    <Funnel items={(funnel.stages || []).map((s, i) => ({ label: funnel.stageDefinitions?.[i]?.label || s.key, value: s.value }))} />
                  )}
                </Card>
              </div>

              <div className="grid cols-2">
                <Card title="Branch Comparison" subtitle={`Revenue by branch · ${dateRange}`}>
                  {loading ? (
                    <Skeleton variant="row" count={4} style={{ height: 20, margin: "10px 0" }} />
                  ) : branchRevenue.length === 0 ? (
                    <EmptyState icon="₹" title="No branch data" hint="No revenue recorded in this period." />
                  ) : (
                    branchRevenue.map((b) => (
                      <div className="metric-row" key={b.branch} style={{ cursor: "pointer" }} onClick={() => router.push(`/owner/finance/transactions?branch=${encodeURIComponent(b.branch)}`)}>
                        <span>{b.branch}{surgeries.byBranch?.[b.branch] != null ? ` · ${surgeries.byBranch[b.branch]} surgeries` : ""}</span>
                        <div style={{ flex: 1, height: 6, background: "var(--surface-alt, #eee)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${Math.round((b.revenue / maxBranchRevenue) * 100)}%`, height: "100%", background: "var(--info)" }} />
                        </div>
                        <strong>{rupee(b.revenue)}</strong>
                      </div>
                    ))
                  )}
                </Card>

                <Card title="Performers" subtitle="Top and bottom scored employees, trailing 30 days — see /owner/employees for the methodology" actions={<Link href="/owner/employees" className="btn" style={{ textDecoration: "none" }}>Open →</Link>}>
                  {loading ? (
                    <Skeleton variant="row" count={6} style={{ height: 18, margin: "8px 0" }} />
                  ) : performers.scoredCount === 0 ? (
                    <EmptyState icon="—" title="Not enough data" hint="No employee met the minimum sample size to be scored this window." />
                  ) : (
                    <DataTable
                      columns={[
                        { key: "name", label: "Employee" },
                        { key: "section", label: "Section" },
                        { key: "band", label: "Band", render: (r) => <Badge kind={r.band === "Excellent" || r.band === "Good" ? "good" : r.band === "Average" ? "info" : "bad"}>{r.band}</Badge> },
                        { key: "score", label: "Score", align: "right" },
                      ]}
                      rows={[...(performers.top || []), ...(performers.bottom || [])].map((p, i) => ({ ...p, id: i }))}
                    />
                  )}
                </Card>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
