"use client";

import { useMemo, useState } from "react";
import { OwnerPage, Card, FilterBar, KpiRow, DataTable, ErrorState, Badge } from "@/components/owner";
import { AiBriefPanel } from "@/components/owner/ai";
import { useAiInsight } from "@/lib/ai/client/useAiInsight";
import { useOwnerData } from "@/lib/owner/useOwnerData";
import { rupee, num } from "@/lib/owner/format";
import { bucketTone, bucketLabel, isOverdueBucket } from "@/lib/ageing";

export default function FinanceLiabilitiesPage() {
  const [filterState, setFilterState] = useState(null);

  const branch = filterState?.filters?.branch && filterState.filters.branch !== "All" ? filterState.filters.branch : "";
  const summaryUrl = filterState ? `/api/payables/summary?${new URLSearchParams(branch ? { branch } : {}).toString()}` : null;
  const ageingUrl = filterState ? `/api/payables/summary?${new URLSearchParams({ ageing: "1", ...(branch ? { branch } : {}) }).toString()}` : null;

  const { data: summaryData, loading, error, isValidating: summaryValidating, mutate: loadSummary } = useOwnerData(summaryUrl);
  const { data: ageingData, isValidating: ageingValidating, mutate: loadAgeing } = useOwnerData(ageingUrl);

  const overall = summaryData?.overall || null;
  const byPurpose = summaryData?.byPurpose || [];
  const byBucket = ageingData?.byBucket || [];
  const isValidating = summaryValidating || ageingValidating;
  const load = () => { loadSummary(); loadAgeing(); };

  // Every bucket except "current" (not yet due) is past its due date.
  const overdue = byBucket.filter((b) => isOverdueBucket(b._id)).reduce((s, b) => s + (b.totalPending || 0), 0);

  const aiScope = useMemo(() => ({ branch }), [branch]);
  const liabilitiesAi = useAiInsight("finance.liabilities", aiScope, { kind: "brief", enabled: !!filterState });

  return (
    <OwnerPage
      title="Liabilities"
      subtitle="Payables outstanding — same data as /admin/liabilities, owner-level rollup"
      aiState={liabilitiesAi}
      controls={
        <button className="icon-btn" onClick={() => load()} disabled={isValidating} title="Refresh">
          {isValidating ? "…" : "⟳"}
        </button>
      }
    >
      <AiBriefPanel feature="finance.liabilities" scope={aiScope} title="Liabilities" enabled={!!filterState} aiState={liabilitiesAi} />

      <FilterBar show={["branch"]} onChange={({ filters, range }) => setFilterState({ filters, range })} />

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <>
          <KpiRow
            loading={loading || !overall}
            primaryIndex={0}
            items={[
              { label: "Total Owed", value: rupee(overall?.totalOwed), rawValue: overall?.totalOwed, format: "rupee", sub: `${num(overall?.count)} payables · all-time`, kind: "info" },
              { label: "Paid", value: rupee(overall?.totalPaid), rawValue: overall?.totalPaid, format: "rupee", sub: "All-time", kind: "good" },
              { label: "Pending", value: rupee(overall?.totalPending), rawValue: overall?.totalPending, format: "rupee", sub: "Outstanding now", kind: overall?.totalPending > 0 ? "warn" : "good" },
              { label: "Overdue", value: rupee(overdue), rawValue: overdue, format: "rupee", sub: "Past its due date", kind: overdue > 0 ? "bad" : "good" },
            ]}
          />

          <div className="grid cols-equal">
            <Card title="By Purpose" subtitle="SALARY / RENT / ELECTRICITY / COLLAB_CLINIC / TAX / ...">
              <DataTable
                loading={loading}
                columns={[
                  { key: "purpose", label: "Purpose", render: (r) => r._id || "—" },
                  { key: "count", label: "Count", align: "right", render: (r) => num(r.count) },
                  { key: "totalOwed", label: "Owed", align: "right", render: (r) => rupee(r.totalOwed) },
                  { key: "totalPaid", label: "Paid", align: "right", render: (r) => rupee(r.totalPaid) },
                  { key: "totalPending", label: "Pending", align: "right", render: (r) => rupee(r.totalPending) },
                ]}
                rows={byPurpose.map((r, i) => ({ ...r, id: i }))}
              />
            </Card>
            <Card title="Aging" subtitle="Pending only, overdue flagged">
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
