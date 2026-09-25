"use client";

import { useMemo, useState } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, FilterBar, ReportTable, KpiRow, ErrorState, InlineNotice, Modal } from "@/components/owner";
import { AiBriefPanel, AiScanOverlay, aiVerdictColumn } from "@/components/owner/ai";
import { useAiInsight } from "@/lib/ai/client/useAiInsight";
import { useAiVerdicts } from "@/lib/ai/client/useAiVerdicts";
import { useOwnerData } from "@/lib/owner/useOwnerData";
import { rupee, num } from "@/lib/owner/format";
import { usePagedList } from "@/lib/owner/usePagedList";

const PLATFORM_OPTIONS = [{ value: "", label: "All platforms" }, { value: "Meta", label: "Meta" }, { value: "Google", label: "Google" }];

const pct = (n) => (n == null ? "—" : `${Math.round(n * 100)}%`);
const ratioMoney = (n) => (n == null ? "—" : rupee(n));

function CampaignLeadsDrillThrough({ campaign, range, onClose }) {
  const list = usePagedList({ defaultSort: "leadDate", defaultDir: "desc" });

  const url = useMemo(() => {
    const params = new URLSearchParams(list.query);
    params.set("from", range.from);
    params.set("to", range.to);
    return `/api/owner/marketing/campaign-performance/${campaign.campaignId}/leads?${params.toString()}`;
  }, [list.query, range, campaign.campaignId]);
  const { data, loading, error, mutate: load } = useOwnerData(url);
  const rows = data?.rows || [];
  const total = data?.total || 0;
  const callbyError = data?.callbyError || null;

  return (
    <Modal open onClose={onClose} title={campaign.campaignName} subtitle={`${campaign.platform} · ${campaign.branch}`}>
      {callbyError && <InlineNotice kind="warn">Calling data unavailable: {callbyError}</InlineNotice>}
      <ReportTable
        tableId="campaign-leads-drillthrough"
        columns={[
          { key: "name", label: "Name", render: (r) => r.name || "—" },
          { key: "phone", label: "Phone", render: (r) => r.phone || "—" },
          { key: "leadDate", label: "Lead Date", sortable: true, render: (r) => (r.leadDate ? new Date(r.leadDate).toLocaleDateString("en-IN") : "—") },
          { key: "calls", label: "Calls", align: "right", render: (r) => (r.calls == null ? "—" : num(r.calls)) },
          { key: "lastEngagementBand", label: "Last Engagement", render: (r) => r.lastEngagementBand ?? "—" },
          { key: "lastAgent", label: "Last Agent", render: (r) => r.lastAgent ?? "—" },
          { key: "patientStatus", label: "Patient Status", render: (r) => r.patientStatus || "—" },
          { key: "amountReceived", label: "Amount Received", align: "right", render: (r) => rupee(r.amountReceived) },
        ]}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={load}
        {...list.tableProps}
        total={total}
        emptyMessage="No leads for this campaign in range."
        csvFilename={`${campaign.campaignName}-leads.csv`}
      />
    </Modal>
  );
}

export default function CampaignPerformancePage() {
  const [filterState, setFilterState] = useState(null);
  const [sort, setSort] = useState({ key: "spend", dir: "desc" });
  const [drillCampaign, setDrillCampaign] = useState(null);

  const { data: templateData } = useOwnerData("/api/owner/marketing/campaign-leads/template");
  const campaignOptions = useMemo(
    () => [
      { value: "", label: "All campaigns" },
      ...(templateData?.campaigns || []).map((c) => ({ value: c.id, label: c.name })),
    ],
    [templateData],
  );

  const aiScope = useMemo(() => {
    if (!filterState) return {};
    const s = { from: filterState.range.from, to: filterState.range.to };
    if (filterState.filters.branch && filterState.filters.branch !== "All") s.branch = filterState.filters.branch;
    if (filterState.filters.platform) s.platform = filterState.filters.platform;
    if (filterState.filters.campaignId) s.campaignId = filterState.filters.campaignId;
    return s;
  }, [filterState]);

  const url = useMemo(() => {
    if (!filterState) return null;
    return `/api/owner/marketing/campaign-performance?${new URLSearchParams(aiScope).toString()}`;
  }, [filterState, aiScope]);

  const { data, loading, error, mutate: load } = useOwnerData(url);
  const performanceAi = useAiInsight("marketing.performance", aiScope, { kind: "brief", enabled: !!filterState });
  const verdicts = useAiVerdicts("marketing.performance", aiScope, { enabled: !!filterState });

  const campaigns = data?.campaigns || [];
  const sortedCampaigns = useMemo(() => {
    const list = [...campaigns];
    list.sort((a, b) => {
      const av = a[sort.key] ?? -Infinity;
      const bv = b[sort.key] ?? -Infinity;
      return sort.dir === "asc" ? av - bv : bv - av;
    });
    return list;
  }, [campaigns, sort]);

  const totals = useMemo(
    () =>
      campaigns.reduce(
        (acc, c) => ({
          spend: acc.spend + (c.spend || 0),
          leadsUploaded: acc.leadsUploaded + (c.leadsUploaded || 0),
          converted: acc.converted + (c.converted || 0),
          revenue: acc.revenue + (c.revenue || 0),
        }),
        { spend: 0, leadsUploaded: 0, converted: 0, revenue: 0 },
      ),
    [campaigns],
  );

  const kpiItems = [
    { label: "Spend", value: rupee(totals.spend), kind: "info" },
    { label: "Leads Uploaded", value: num(totals.leadsUploaded), kind: "info" },
    { label: "Converted", value: num(totals.converted), kind: "good" },
    { label: "Revenue", value: rupee(totals.revenue), sub: "Unbounded — see note below", kind: "good" },
    { label: "ROAS", value: totals.spend > 0 ? `${(totals.revenue / totals.spend).toFixed(2)}x` : "—", kind: totals.revenue >= totals.spend ? "good" : "warn" },
  ];
  if (data && data.overlapCount > 0) {
    kpiItems.push({ label: "Overlapping Leads", value: num(data.overlapCount), sub: "Counted in every campaign that delivered them", kind: "warn" });
  }

  const onSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar title="Campaign Performance" subtitle="Spend, calls and outcomes per campaign — from uploaded campaign leads" aiState={performanceAi} />

        <div className="content">
          <AiBriefPanel feature="marketing.performance" scope={aiScope} title="Campaign Performance" enabled={!!filterState} aiState={performanceAi} />

          <FilterBar
            show={["date", "branch"]}
            extras={[
              { key: "platform", label: "Platform", options: PLATFORM_OPTIONS },
              { key: "campaignId", label: "Campaign", options: campaignOptions },
            ]}
            defaults={{ platform: "", campaignId: "" }}
            onChange={({ filters, range }) => setFilterState({ filters, range })}
          />

          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <>
              <KpiRow items={kpiItems} loading={loading} />

              {data?.callbyError && (
                <InlineNotice kind="warn">
                  Calling data unavailable ({data.callbyError}) — spend, leads, patients, converted and revenue below are still accurate; calling columns show —.
                </InlineNotice>
              )}

              <Card title="Attribution window">
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: "var(--fs-12)", color: "var(--ink-muted)" }}>
                  {(data?.window || []).map((line, i) => <li key={i}>{line}</li>)}
                </ul>
              </Card>

              <Card title="Campaigns" subtitle={loading ? "Loading…" : `${campaigns.length} campaign(s) · click a row for lead-level detail`}>
                <AiScanOverlay active={verdicts.loading}>
                <ReportTable
                  tableId="campaign-performance"
                  columns={[
                    { key: "campaignName", label: "Campaign", sortable: true, render: (c) => c.campaignName },
                    aiVerdictColumn({ byId: verdicts.byId, loading: verdicts.loading, labelSet: "campaign" }),
                    { key: "platform", label: "Platform", render: (c) => c.platform },
                    { key: "branch", label: "Branch", render: (c) => c.branch },
                    { key: "spend", label: "Spend", align: "right", sortable: true, render: (c) => rupee(c.spend) },
                    { key: "cpc", label: "CPC", align: "right", render: (c) => ratioMoney(c.cpc) },
                    { key: "leadsUploaded", label: "Leads", align: "right", sortable: true, render: (c) => num(c.leadsUploaded) },
                    { key: "leadsCalled", label: "Called", align: "right", render: (c) => (c.leadsCalled == null ? "—" : num(c.leadsCalled)) },
                    { key: "leadsConnected", label: "Connected", align: "right", render: (c) => (c.leadsConnected == null ? "—" : num(c.leadsConnected)) },
                    { key: "leadsInterested", label: "Interested", align: "right", render: (c) => (c.leadsInterested == null ? "—" : num(c.leadsInterested)) },
                    { key: "avgCallSeconds", label: "Avg. Call (s)", align: "right", render: (c) => (c.avgCallSeconds == null ? "—" : num(c.avgCallSeconds)) },
                    { key: "patientsMatched", label: "Patients", align: "right", render: (c) => num(c.patientsMatched) },
                    { key: "visited", label: "Visited", align: "right", render: (c) => num(c.visited) },
                    { key: "converted", label: "Converted", align: "right", sortable: true, render: (c) => num(c.converted) },
                    { key: "revenue", label: "Revenue", align: "right", sortable: true, render: (c) => rupee(c.revenue) },
                    { key: "packageValue", label: "Package Value", align: "right", defaultHidden: true, render: (c) => rupee(c.packageValue) },
                    { key: "cpl", label: "CPL", align: "right", render: (c) => ratioMoney(c.cpl) },
                    { key: "costPerConnectedLead", label: "Cost / Connected", align: "right", defaultHidden: true, render: (c) => ratioMoney(c.costPerConnectedLead) },
                    { key: "cac", label: "CAC", align: "right", render: (c) => ratioMoney(c.cac) },
                    { key: "roas", label: "ROAS", align: "right", render: (c) => (c.roas == null ? "—" : `${c.roas.toFixed(2)}x`) },
                    { key: "sharedWithCampaigns", label: "Shared w/ other campaigns", align: "right", defaultHidden: true, render: (c) => num(c.sharedWithCampaigns) },
                  ]}
                  rows={sortedCampaigns.map((c) => ({ ...c, id: c.campaignId }))}
                  loading={loading}
                  sortKey={sort.key}
                  sortDir={sort.dir}
                  onSort={onSort}
                  page={1}
                  pageSize={Math.max(sortedCampaigns.length, 1)}
                  total={sortedCampaigns.length}
                  onRowClick={(c) => setDrillCampaign(c)}
                  emptyMessage="No campaigns match these filters."
                  csvFilename="campaign-performance.csv"
                />
                </AiScanOverlay>
              </Card>
            </>
          )}
        </div>
      </div>

      {drillCampaign && filterState && (
        <CampaignLeadsDrillThrough campaign={drillCampaign} range={filterState.range} onClose={() => setDrillCampaign(null)} />
      )}
    </div>
  );
}
