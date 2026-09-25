"use client";

import { useMemo, useState } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, FilterBar, KpiRow, DataTable, ErrorState, Badge } from "@/components/owner";
import { AiBriefPanel } from "@/components/owner/ai";
import { useAiInsight } from "@/lib/ai/client/useAiInsight";
import { useOwnerData } from "@/lib/owner/useOwnerData";
import { rupee, num, fmtDate } from "@/lib/owner/format";

const STATUS_KIND = { Paid: "good", "Partially Paid": "info", Pending: "warn", Overdue: "bad" };

// Payable{purpose:"RENT"} per property — reuses the existing
// /api/payables/grouped (party mode) rather than a new aggregation, grouped
// client-side by payee.label/branch (Owner Panel v2, Part 5).
export default function FinanceRentPage() {
  const [filterState, setFilterState] = useState(null);

  const url = useMemo(() => {
    if (!filterState) return null;
    const branch = filterState.filters.branch && filterState.filters.branch !== "All" ? filterState.filters.branch : "";
    const params = new URLSearchParams({ groupBy: "party", purpose: "RENT", page: "1", limit: "200" });
    if (branch) params.set("branch", branch);
    return `/api/payables/grouped?${params.toString()}`;
  }, [filterState]);

  const { data, loading, error, isValidating, mutate: load } = useOwnerData(url);
  const rows = data?.rows || [];

  const byProperty = {};
  for (const r of rows) {
    const key = r.payee?.label || "Unlabelled";
    byProperty[key] ||= { property: key, branch: r.branch, monthlyAmount: 0, annualTotal: 0, pending: 0, count: 0, latestStatus: null, latestDueDate: null };
    const p = byProperty[key];
    p.annualTotal += r.totalAmount || 0;
    p.pending += r.pending || 0;
    p.count += 1;
    if (!p.latestDueDate || new Date(r.dueDate) > new Date(p.latestDueDate)) {
      p.latestDueDate = r.dueDate;
      p.monthlyAmount = r.totalAmount || 0;
      p.latestStatus = r.status;
    }
  }
  const propertyRows = Object.values(byProperty);
  const overdueCount = rows.filter((r) => r.status === "Overdue").length;
  const totalPending = rows.reduce((s, r) => s + (r.pending || 0), 0);

  const aiScope = useMemo(() => {
    const branch = filterState?.filters?.branch && filterState.filters.branch !== "All" ? filterState.filters.branch : "";
    return { branch };
  }, [filterState]);
  const rentAi = useAiInsight("finance.rent", aiScope, { kind: "brief", enabled: !!filterState });

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar
          title="Rent"
          subtitle="Payable purpose: RENT — per property, from the existing payables data"
          aiState={rentAi}
          controls={
            <button className="icon-btn" onClick={() => load()} disabled={isValidating} title="Refresh">
              {isValidating ? "…" : "⟳"}
            </button>
          }
        />

        <div className="content">
          <AiBriefPanel feature="finance.rent" scope={aiScope} title="Rent" enabled={!!filterState} aiState={rentAi} />

          <FilterBar show={["branch"]} onChange={({ filters, range }) => setFilterState({ filters, range })} />

          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <>
              <KpiRow
                loading={loading}
                primaryIndex={0}
                items={[
                  { label: "Properties", value: loading ? "—" : propertyRows.length, rawValue: loading ? null : propertyRows.length, format: "num", sub: "Distinct payees", kind: "info" },
                  { label: "Pending", value: loading ? "—" : rupee(totalPending), rawValue: loading ? null : totalPending, format: "rupee", sub: "Outstanding", kind: totalPending > 0 ? "warn" : "good" },
                  { label: "Overdue", value: loading ? "—" : overdueCount, rawValue: loading ? null : overdueCount, format: "num", sub: "Payable rows", kind: overdueCount ? "bad" : "good" },
                ]}
              />

              <Card title="By Property" subtitle={loading ? "Loading…" : `${propertyRows.length} properties`}>
                <DataTable
                  tall
                  loading={loading}
                  columns={[
                    { key: "property", label: "Property" },
                    { key: "branch", label: "Branch" },
                    { key: "monthlyAmount", label: "Latest Monthly Amount", align: "right", render: (r) => rupee(r.monthlyAmount) },
                    { key: "latestDueDate", label: "Due Date", render: (r) => fmtDate(r.latestDueDate) },
                    { key: "latestStatus", label: "Status", render: (r) => <Badge kind={STATUS_KIND[r.latestStatus] || "neutral"}>{r.latestStatus || "—"}</Badge> },
                    { key: "pending", label: "Pending (all records)", align: "right", render: (r) => rupee(r.pending) },
                    { key: "annualTotal", label: "Total (all records)", align: "right", render: (r) => rupee(r.annualTotal) },
                    { key: "count", label: "Records", align: "right", render: (r) => num(r.count) },
                  ]}
                  rows={propertyRows.map((r) => ({ ...r, id: r.property }))}
                />
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
