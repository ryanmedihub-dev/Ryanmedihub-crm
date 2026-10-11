"use client";

import { useMemo, useState } from "react";
import { OwnerPage, Card, FilterBar, KpiRow, DataTable, ErrorState, Badge } from "@/components/owner";
import { AiBriefPanel } from "@/components/owner/ai";
import { useAiInsight } from "@/lib/ai/client/useAiInsight";
import { useOwnerData } from "@/lib/owner/useOwnerData";
import { rupee, num } from "@/lib/owner/format";
import { bucketTone, bucketLabel } from "@/lib/ageing";

export default function FinanceAssetsPage() {
  const [filterState, setFilterState] = useState(null);

  const branch = filterState?.filters?.branch && filterState.filters.branch !== "All" ? filterState.filters.branch : "";
  const summaryUrl = filterState ? `/api/receivables/summary?${new URLSearchParams(branch ? { branch } : {}).toString()}` : null;
  const ageingUrl = filterState ? `/api/receivables/summary?${new URLSearchParams({ ageing: "1", ...(branch ? { branch } : {}) }).toString()}` : null;

  const { data: summaryData, loading, error, isValidating: summaryValidating, mutate: loadSummary } = useOwnerData(summaryUrl);
  const { data: ageingData, isValidating: ageingValidating, mutate: loadAgeing } = useOwnerData(ageingUrl);

  const overall = summaryData?.overall || null;
  const byPurpose = summaryData?.byPurpose || [];
  const byBucket = ageingData?.byBucket || [];
  const isValidating = summaryValidating || ageingValidating;
  const load = () => { loadSummary(); loadAgeing(); };

  const aiScope = useMemo(() => ({ branch }), [branch]);
  const assetsAi = useAiInsight("finance.assets", aiScope, { kind: "brief", enabled: !!filterState });

  return (
    <OwnerPage
      title="Assets"
      subtitle="Receivables outstanding — same data as /admin/assets, owner-level rollup"
      aiState={assetsAi}
      controls={
        <button className="icon-btn" onClick={() => load()} disabled={isValidating} title="Refresh">
          {isValidating ? "…" : "⟳"}
        </button>
      }
    >
      <AiBriefPanel feature="finance.assets" scope={aiScope} title="Assets" enabled={!!filterState} aiState={assetsAi} />

      <FilterBar show={["branch"]} onChange={({ filters, range }) => setFilterState({ filters, range })} />

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <>
          <KpiRow
            loading={loading || !overall}
            primaryIndex={0}
            items={[
              { label: "Total Owed", value: rupee(overall?.totalReceivable), rawValue: overall?.totalReceivable, format: "rupee", sub: `${num(overall?.count)} receivables · all-time`, kind: "info" },
              { label: "Received", value: rupee(overall?.totalReceived), rawValue: overall?.totalReceived, format: "rupee", sub: "All-time", kind: "good" },
              { label: "Pending", value: rupee(overall?.totalPending), rawValue: overall?.totalPending, format: "rupee", sub: "Outstanding now", kind: overall?.totalPending > 0 ? "warn" : "good" },
            ]}
          />

          <div className="grid cols-equal">
            <Card title="By Purpose">
              <DataTable
                loading={loading}
                columns={[
                  { key: "purpose", label: "Purpose", render: (r) => r._id || "—" },
                  { key: "count", label: "Count", align: "right", render: (r) => num(r.count) },
                  { key: "totalReceivable", label: "Owed", align: "right", render: (r) => rupee(r.totalReceivable) },
                  { key: "totalPending", label: "Pending", align: "right", render: (r) => rupee(r.totalPending) },
                ]}
                rows={byPurpose.map((r, i) => ({ ...r, id: i }))}
              />
            </Card>
            <Card title="Aging" subtitle="Pending only">
              <DataTable
                loading={loading}
                columns={[
                  { key: "bucket", label: "Bucket", render: (r) => <Badge kind={bucketTone(r._id)}>{bucketLabel(r._id)}</Badge> },
                  { key: "count", label: "Count", align: "right", render: (r) => num(r.count) },
                  { key: "totalPending", label: "Pending", align: "right", render: (r) => rupee(r.totalPending) },
                ]}
                rows={byBucket.map((r, i) => ({ ...r, id: i }))}
              />
            </Card>
          </div>
        </>
      )}
    </OwnerPage>
  );
}
