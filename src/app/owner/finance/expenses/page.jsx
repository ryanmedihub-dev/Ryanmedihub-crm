"use client";

import { useMemo, useState } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, FilterBar, KpiRow, ReportTable, ErrorState, InlineNotice } from "@/components/owner";
import { AiBriefPanel } from "@/components/owner/ai";
import { useAiInsight } from "@/lib/ai/client/useAiInsight";
import { useOwnerData } from "@/lib/owner/useOwnerData";
import { usePagedList } from "@/lib/owner/usePagedList";
import { rupee, num } from "@/lib/owner/format";

export default function FinanceExpensesPage() {
  const [filterState, setFilterState] = useState(null);
  const list = usePagedList({ defaultSort: "total", defaultDir: "desc" });

  const aiScope = useMemo(
    () => (filterState ? { dateFrom: filterState.range.from, dateTo: filterState.range.to, branch: filterState.filters.branch && filterState.filters.branch !== "All" ? filterState.filters.branch : "" } : {}),
    [filterState],
  );

  const url = useMemo(() => {
    if (!filterState) return null;
    const params = new URLSearchParams();
    params.set("dateFrom", filterState.range.from);
    params.set("dateTo", filterState.range.to);
    if (filterState.filters.branch && filterState.filters.branch !== "All") params.set("branch", filterState.filters.branch);
    return `/api/owner/finance/expenses?${params.toString()}&${list.query}`;
  }, [filterState, list.query]);

  const { data, loading, error, isValidating, mutate: load } = useOwnerData(url);
  const expensesAi = useAiInsight("finance.expenses", aiScope, { kind: "brief", enabled: !!filterState });

  const recon = data?.marketingReconciliation;
  const deltaBad = recon && Math.abs(recon.delta) > 1;

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar
          title="Expenses"
          subtitle="By head and sub-type — actuals only, no budget data exists to compare against"
          aiState={expensesAi}
          controls={
            <button className="icon-btn" onClick={() => load()} disabled={isValidating} title="Refresh">
              {isValidating ? "…" : "⟳"}
            </button>
          }
        />

        <div className="content">
          <AiBriefPanel feature="finance.expenses" scope={aiScope} title="Expenses" enabled={!!filterState} aiState={expensesAi} />

          <FilterBar show={["date", "branch"]} onChange={({ filters, range }) => { list.resetPage(); setFilterState({ filters, range }); }} />

          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <>
              <KpiRow
                loading={loading || !data}
                primaryIndex={0}
                items={[
                  { label: "Total Expense", value: rupee(data?.totalExpense), rawValue: data?.totalExpense, format: "rupee", sub: "This period", kind: "bad" },
                  { label: "Entries", value: num(data?.entries), rawValue: data?.entries, format: "num", sub: "Expense transactions", kind: "info" },
                ]}
              />

              {recon && (
                <InlineNotice kind={deltaBad ? "error" : "info"} title="Marketing spend reconciliation">
                  Meta/Google ads expense entries: <strong>{rupee(recon.transactionsTotal)}</strong> · Ad Spend Entry
                  (Part 4, <code>AdSpend</code>): <strong>{rupee(recon.adSpendTotal)}</strong> · Difference:{" "}
                  <strong>{rupee(recon.delta)}</strong>
                  {deltaBad ? " — someone entered spend in one place and not the other for this period." : " — these agree."}
                </InlineNotice>
              )}

              <Card title="By Head / Sub-type" subtitle={loading ? "Loading…" : `${data?.total || 0} rows`}>
                <ReportTable
                  tableId="finance-expenses"
                  loading={loading}
                  columns={[
                    { key: "category", label: "Category", sortable: true },
                    { key: "subType", label: "Sub-type", sortable: true },
                    { key: "count", label: "Count", align: "right", sortable: true, render: (r) => num(r.count) },
                    { key: "total", label: "Total", align: "right", sortable: true, render: (r) => rupee(r.total) },
                  ]}
                  rows={(data?.rows || []).map((r) => ({ ...r, id: `${r.category}::${r.subType}` }))}
                  total={data?.total || 0}
                  {...list.tableProps}
                  searchPlaceholder="Search category / sub-type…"
                  csvFilename="expenses.csv"
                />
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
