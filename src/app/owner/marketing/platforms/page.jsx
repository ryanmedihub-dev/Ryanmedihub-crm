"use client";

import { useMemo, useState } from "react";
import { OwnerPage, Card, KpiRow, DataTable, Badge, ErrorState, EmptyState, InlineNotice, ManualDataNotice, FilterBar } from "@/components/owner";
import { AiBriefPanel } from "@/components/owner/ai";
import { useAiInsight } from "@/lib/ai/client/useAiInsight";
import { useOwnerData } from "@/lib/owner/useOwnerData";
import { rupee, num as fmt, roasFmt } from "@/lib/owner/format";

const FILTER_DEFAULTS = { range: "Last 30 Days" };

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
  const [filterState, setFilterState] = useState(null);

  const branch = filterState?.filters.branch ?? "All";
  const dateRange = filterState?.filters.range ?? FILTER_DEFAULTS.range;

  const aiScope = useMemo(
    () => (filterState ? { branch, from: filterState.range.from, to: filterState.range.to } : {}),
    [filterState, branch],
  );
  const ready = !!filterState;
  const platformsAi = useAiInsight("marketing.platforms", aiScope, { kind: "brief", enabled: ready });

  const { data, loading: fetching, error, isValidating, mutate: fetchSummary } = useOwnerData(
    ready ? "/api/owner/marketing-summary" : null,
    { body: aiScope },
  );
  const rows = data?.rows || [];
  const note = data?.note ?? null;
  const lastUpdatedAt = data?.lastUpdatedAt ?? null;
  const lastUpdatedBy = data?.lastUpdatedBy ?? null;
  const loading = fetching || !data;

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
    <OwnerPage
      title="Meta & Google"
      subtitle="What the ad spend bought — CPL, CAC, ROAS by platform and campaign"
      aiState={platformsAi}
      controls={
        <button className="icon-btn" onClick={() => fetchSummary()} disabled={isValidating} title="Refresh">
          {isValidating ? "…" : "⟳"}
        </button>
      }
    >
      <FilterBar
        defaults={FILTER_DEFAULTS}
        onChange={({ filters, range }) => setFilterState({ filters, range })}
      />

      <AiBriefPanel feature="marketing.platforms" scope={aiScope} title="Meta & Google" enabled={ready} aiState={platformsAi} />

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
    </OwnerPage>
  );
}
