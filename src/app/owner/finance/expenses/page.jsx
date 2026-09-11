"use client";

import { useCallback, useEffect, useState } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, FilterBar, KpiRow, DataTable, ErrorState, InlineNotice } from "@/components/owner";
import { ownerFetch } from "@/lib/ownerFetch";
import { rupee, num } from "@/lib/owner/format";

export default function FinanceExpensesPage() {
  const [filterState, setFilterState] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(
    async ({ signal } = {}) => {
      if (!filterState) return;
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.set("dateFrom", filterState.range.from);
      params.set("dateTo", filterState.range.to);
      if (filterState.filters.branch && filterState.filters.branch !== "All") params.set("branch", filterState.filters.branch);
      const r = await ownerFetch(`/api/owner/finance/expenses?${params.toString()}`, { signal });
      if (r.aborted) return;
      if (r.ok) setData(r.data);
      else setError(r.error);
      setLoading(false);
    },
    [filterState],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load({ signal: ctrl.signal });
    return () => ctrl.abort();
  }, [load]);

  const recon = data?.marketingReconciliation;
  const deltaBad = recon && Math.abs(recon.delta) > 1;

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar
          title="Expenses"
          subtitle="By head and sub-type — actuals only, no budget data exists to compare against"
          controls={
            <button className="icon-btn" onClick={() => load()} disabled={loading} title="Refresh">
              {loading ? "…" : "⟳"}
            </button>
          }
        />

        <div className="content">
          <FilterBar show={["date", "branch"]} onChange={({ filters, range }) => setFilterState({ filters, range })} />

          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <>
              <KpiRow
                loading={loading || !data}
                primaryIndex={0}
                items={[{ label: "Total Expense", value: rupee(data?.totalExpense), sub: "This period", kind: "bad" }]}
              />

              {recon && (
                <InlineNotice kind={deltaBad ? "error" : "info"} title="Marketing spend reconciliation">
                  Meta/Google ads expense entries: <strong>{rupee(recon.transactionsTotal)}</strong> · Ad Spend Entry
                  (Part 4, <code>AdSpend</code>): <strong>{rupee(recon.adSpendTotal)}</strong> · Difference:{" "}
                  <strong>{rupee(recon.delta)}</strong>
                  {deltaBad ? " — someone entered spend in one place and not the other for this period." : " — these agree."}
                </InlineNotice>
              )}

              <Card title="By Head / Sub-type" subtitle={loading ? "Loading…" : `${(data?.rows || []).length} rows`}>
                <DataTable
                  tall
                  loading={loading}
                  columns={[
                    { key: "category", label: "Category" },
                    { key: "subType", label: "Sub-type" },
                    { key: "count", label: "Count", align: "right", render: (r) => num(r.count) },
                    { key: "total", label: "Total", align: "right", render: (r) => rupee(r.total) },
                  ]}
                  rows={(data?.rows || []).map((r, i) => ({ ...r, id: i }))}
                />
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
