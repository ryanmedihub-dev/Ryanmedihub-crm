"use client";

import { useEffect, useState, useCallback } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, KpiRow, DataTable, Badge, ErrorState, EmptyState, InlineNotice, ManualDataNotice } from "@/components/owner";
import { AiBriefPanel } from "@/components/owner/ai";
import { useAiInsight } from "@/lib/ai/client/useAiInsight";
import { ownerFetch } from "@/lib/ownerFetch";
import { rupee, num as fmt, roasFmt } from "@/lib/owner/format";
import { OWNER_BRANCHES as BRANCHES, DATE_RANGES, buildDateRange } from "@/lib/owner/filters";

function summarize(rows) {
  const byPlatform = {};
  rows.forEach((r) => {
    (byPlatform[r.platform] ||= []).push(r);
  });

  let totalSpend = 0, totalLeads = 0, totalConverted = 0, totalRevenue = 0;
  Object.values(byPlatform).forEach((platformRows) => {
    const totalRow = platformRows.find((r) => r.isPlatformTotal) || (platformRows.length === 1 ? platformRows[0] : null);
    if (!totalRow) return;
    totalSpend += totalRow.spend || 0;
    totalLeads += totalRow.leads || 0;
    totalConverted += totalRow.converted || 0;
    totalRevenue += totalRow.revenue || 0;
  });

  return {
    totalSpend,
    totalLeads,
    totalConverted,
    totalRevenue,
    blendedCPL: totalLeads > 0 ? totalSpend / totalLeads : null,
    blendedCAC: totalConverted > 0 ? totalSpend / totalConverted : null,
    blendedROAS: totalSpend > 0 ? totalRevenue / totalSpend : null,
  };
}

export default function MarketingProfitabilityPage() {
  const [branch, setBranch]       = useState("All");
  const [dateRange, setDateRange] = useState("Last 30 Days");
  const [custom, setCustom]       = useState({ from: "", to: "" });

  const [rows, setRows]     = useState([]);
  const [note, setNote]     = useState(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [lastUpdatedBy, setLastUpdatedBy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const dateReady = !(dateRange === "Custom" && !custom.from);
  const aiScope = dateReady ? { branch, ...buildDateRange(dateRange, custom) } : {};
  const platformsAi = useAiInsight("marketing.platforms", aiScope, { kind: "brief", enabled: dateReady });

  const fetchSummary = useCallback(async ({ signal } = {}) => {
    if (dateRange === "Custom" && !custom.from) return;
    setLoading(true);
    setError(null);
    const { from, to } = buildDateRange(dateRange, custom);
    const r = await ownerFetch("/api/owner/marketing-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branch, from, to }),
      signal,
    });
    if (r.aborted) return;
    if (r.ok) {
      setRows(r.data?.rows || []);
      setNote(r.data?.note ?? null);
      setLastUpdatedAt(r.data?.lastUpdatedAt ?? null);
      setLastUpdatedBy(r.data?.lastUpdatedBy ?? null);
    } else {
      setError(r.error);
    }
    setLoading(false);
  }, [branch, dateRange, custom]);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchSummary({ signal: ctrl.signal });
    return () => ctrl.abort();
  }, [fetchSummary]);

  const summary = summarize(rows);

  const kpiItems = [
    { label: "Total Spend",   value: rupee(summary.totalSpend), sub: dateRange, kind: "info" },
    { label: "Total Leads",   value: fmt(summary.totalLeads),   sub: "Meta + Google", kind: "info" },
    { label: "Blended CPL",   value: rupee(summary.blendedCPL), sub: "Cost per lead", kind: "good" },
    { label: "Converted",     value: fmt(summary.totalConverted), sub: "Booked or closed", kind: "good" },
    { label: "Blended CAC",   value: rupee(summary.blendedCAC), sub: "Cost per conversion", kind: summary.blendedCAC != null ? "warn" : "info" },
    { label: "Blended ROAS",  value: roasFmt(summary.blendedROAS), sub: "Revenue ÷ spend", kind: summary.blendedROAS != null && summary.blendedROAS >= 1 ? "good" : "bad" },
  ];

  return (
    <div className="app">
      <OwnerSidebar />

      <div className="main">
        <OwnerTopbar
          title="Meta & Google"
          subtitle="What the ad spend bought — CPL, CAC, ROAS by platform and campaign"
          aiState={platformsAi}
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
                  <input
                    type="date"
                    className="control"
                    value={custom.from}
                    onChange={(e) => setCustom((p) => ({ ...p, from: e.target.value }))}
                  />
                  <input
                    type="date"
                    className="control"
                    value={custom.to}
                    onChange={(e) => setCustom((p) => ({ ...p, to: e.target.value }))}
                  />
                </>
              )}
              <button className="icon-btn" onClick={fetchSummary} disabled={loading} title="Refresh">
                {loading ? "…" : "⟳"}
              </button>
            </>
          }
        />

        <div className="content">
          <AiBriefPanel feature="marketing.platforms" scope={aiScope} title="Meta & Google" enabled={dateReady} aiState={platformsAi} />

          {error ? (
            <ErrorState message={error} onRetry={fetchSummary} />
          ) : (
            <>
              <ManualDataNotice lastUpdatedAt={lastUpdatedAt} lastUpdatedBy={lastUpdatedBy} />
              {note && (
                <InlineNotice kind="info" title="Branch scope note">{note}</InlineNotice>
              )}

              <KpiRow items={kpiItems} primaryIndex={5} loading={loading} />

              <Card
                title="Platform / campaign breakdown"
                subtitle={`${dateRange} · ${branch === "All" ? "All branches (spend only)" : `Spend scoped to ${branch}`}`}
              >
                <DataTable
                  tall
                  loading={loading}
                  emptyMessage={<EmptyState icon="◈" title="No ad spend for this filter" hint="Log spend on the Ad Spend Entry screen, or widen the date range." />}
                  columns={[
                    {
                      key: "platform",
                      label: "Platform",
                      render: (row) => <Badge kind={row.platform === "Meta" ? "purple" : "info"}>{row.platform}</Badge>,
                    },
                    {
                      key: "campaignName",
                      label: "Campaign",
                      render: (row) =>
                        row.isPlatformTotal ? (
                          <strong>Platform total</strong>
                        ) : (
                          row.campaignName || <span className="muted">(unnamed)</span>
                        ),
                    },
                    { key: "branch", label: "Branch", render: () => branch },
                    { key: "spend", label: "Spend", align: "right", render: (row) => rupee(row.spend) },
                    { key: "leads", label: "Leads", align: "right", render: (row) => fmt(row.leads) },
                    { key: "cpl", label: "CPL", align: "right", render: (row) => rupee(row.cpl) },
                    { key: "converted", label: "Converted", align: "right", render: (row) => fmt(row.converted) },
                    { key: "cac", label: "CAC", align: "right", render: (row) => rupee(row.cac) },
                    { key: "revenue", label: "Revenue", align: "right", render: (row) => rupee(row.revenue) },
                    {
                      key: "roas",
                      label: "ROAS",
                      align: "right",
                      render: (row) => (
                        <span style={row.roas != null ? { color: row.roas >= 1 ? "var(--pos)" : "var(--crit)", fontWeight: 700 } : undefined}>
                          {roasFmt(row.roas)}
                        </span>
                      ),
                    },
                  ]}
                  rows={loading ? [] : rows.map((r, i) => ({ ...r, id: `${r.platform}-${r.campaignName || "total"}-${i}`, _isTotal: r.isPlatformTotal }))}
                />
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
