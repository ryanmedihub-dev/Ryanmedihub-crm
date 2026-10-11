"use client";

import { useMemo, useState } from "react";
import { OwnerPage, Card, KpiRow, DataTable, ErrorState, EmptyState, TrendChart, SectionLinks, FilterBar } from "@/components/owner";
import { AiBriefPanel } from "@/components/owner/ai";
import { useAiInsight } from "@/lib/ai/client/useAiInsight";
import { useOwnerData } from "@/lib/owner/useOwnerData";
import { rupee, num as fmt } from "@/lib/owner/format";

const FILTER_DEFAULTS = { range: "Last 30 Days" };

const FINANCE_LINKS = [
  { href: "/owner/finance/transactions", label: "All Transactions", note: "Full transaction report" },
  { href: "/owner/finance/expenses", label: "Expenses", note: "By head/sub-type + marketing reconciliation" },
  { href: "/owner/finance/assets", label: "Assets", note: "Receivables, aging" },
  { href: "/owner/finance/liabilities", label: "Liabilities", note: "Payables by purpose, overdue" },
  { href: "/owner/finance/salary-incentive", label: "Salary & Incentive", note: "Per employee, agrees with Part 1" },
  { href: "/owner/finance/rent", label: "Rent", note: "Per property, overdue" },
];

export default function OwnerFinancePage() {
  const [filterState, setFilterState] = useState(null);

  const branch = filterState?.filters.branch ?? "All";
  const dateRange = filterState?.filters.range ?? FILTER_DEFAULTS.range;
  const ready = !!filterState;

  const aiScope = useMemo(
    () => (filterState ? { from: filterState.range.from, to: filterState.range.to, branch } : {}),
    [filterState, branch],
  );
  const overviewAi = useAiInsight("finance.overview", aiScope, { kind: "brief", enabled: ready });

  const qs = ready
    ? new URLSearchParams({
        from: aiScope.from,
        to: aiScope.to,
        ...(branch !== "All" ? { branch } : {}),
      }).toString()
    : null;
  // The receivables/payables summaries are period-independent snapshots, so
  // these two keys are shared with the dashboard's cache.
  const branchQs = branch !== "All" ? `?branch=${encodeURIComponent(branch)}` : "";

  const pnlQ = useOwnerData(qs && `/api/close-book/pnl?${qs}`);
  const cashFlowQ = useOwnerData(qs && `/api/close-book/cash-flow?${qs}`);
  const balanceSheetQ = useOwnerData(qs && `/api/close-book/balance-sheet?${qs}`);
  const recvQ = useOwnerData(ready ? `/api/receivables/summary${branchQs}` : null);
  const payQ = useOwnerData(ready ? `/api/payables/summary${branchQs}` : null);
  const branchQ = useOwnerData(ready ? "/api/owner/finance/branch-profitability" : null, {
    body: { from: aiScope.from, to: aiScope.to },
  });
  const trendQ = useOwnerData(qs && `/api/owner/finance/trend?${qs}`);

  const ALL = [pnlQ, cashFlowQ, balanceSheetQ, recvQ, payQ, branchQ, trendQ];

  const pnl = pnlQ.data;
  const cashFlow = cashFlowQ.data ?? null;
  const balanceSheet = balanceSheetQ.data ?? null;
  const receivable = recvQ.data?.overall ?? null;
  const payable = payQ.data?.overall ?? null;
  const branchRows = branchQ.data?.rows || [];
  const daily = trendQ.data?.daily || [];

  // Only the P&L is load-bearing — the rest degrade to "—" on their own.
  const error = pnlQ.error || pnl?.error || null;
  const loading = pnlQ.loading || !pnl;
  const isValidating = ALL.some((q) => q.isValidating);
  const fetchData = () => ALL.forEach((q) => q.mutate());

  const accountRows = balanceSheet?.accounts || [];

  return (
    <OwnerPage
      title="Accounts, P&L & Expenses"
      subtitle="Reuses the same close-book P&L / balance sheet / cash flow logic as /admin/close-book"
      aiState={overviewAi}
      controls={
        <button className="icon-btn" onClick={fetchData} disabled={isValidating} title="Refresh">
          {isValidating ? "…" : "⟳"}
        </button>
      }
    >
      <FilterBar
        defaults={FILTER_DEFAULTS}
        onChange={({ filters, range }) => setFilterState({ filters, range })}
      />

      <AiBriefPanel feature="finance.overview" scope={aiScope} title="Finance" variant="hero" scoreLabel="Financial Health" enabled={ready} aiState={overviewAi} />

      {error ? (
        <ErrorState message={error} onRetry={fetchData} />
      ) : (
        <>
          <KpiRow
            primaryIndex={2}
            loading={loading}
            items={[
              { label: "Income", value: loading ? "—" : rupee(pnl?.income), rawValue: loading ? null : pnl?.income, format: "rupee", sub: "Accrual", kind: "good" },
              { label: "Expense", value: loading ? "—" : rupee(pnl?.expense), rawValue: loading ? null : pnl?.expense, format: "rupee", sub: "Accrual", kind: "bad" },
              { label: "Profit", value: loading ? "—" : rupee(pnl?.profit), rawValue: loading ? null : pnl?.profit, format: "rupee", sub: dateRange, kind: pnl?.profit >= 0 ? "good" : "bad" },
              { label: "Receipts", value: loading ? "—" : rupee(cashFlow?.receipts), rawValue: loading ? null : cashFlow?.receipts, format: "rupee", sub: "Cash-basis", kind: "info" },
              { label: "Payments", value: loading ? "—" : rupee(cashFlow?.payments), rawValue: loading ? null : cashFlow?.payments, format: "rupee", sub: "Cash-basis", kind: "info" },
              { label: "Balance Left", value: loading ? "—" : rupee(cashFlow?.balanceLeft), rawValue: loading ? null : cashFlow?.balanceLeft, format: "rupee", sub: "Receipts − payments", kind: cashFlow?.balanceLeft >= 0 ? "good" : "bad" },
              { label: "Pending Receivable", value: loading ? "—" : rupee(receivable?.totalPending), rawValue: loading ? null : receivable?.totalPending, format: "rupee", sub: `${fmt(receivable?.count ?? 0)} open`, kind: "info" },
              { label: "Pending Payable", value: loading ? "—" : rupee(payable?.totalPending), rawValue: loading ? null : payable?.totalPending, format: "rupee", sub: `${fmt(payable?.count ?? 0)} open`, kind: payable?.totalPending > 0 ? "warn" : "good" },
            ]}
          />

          <Card title="Balance sheet by account" subtitle={loading ? "Loading…" : `${dateRange}${branch !== "All" ? ` · ${branch}` : ""}`}>
            <DataTable
              tall
              loading={loading}
              emptyMessage={<EmptyState icon="▦" title="No account data" hint="No ledger movement in this period." />}
              columns={[
                { key: "account", label: "Account" },
                { key: "openingBalance", label: "Opening", align: "right", render: (r) => rupee(r.openingBalance) },
                { key: "totalIn", label: "In", align: "right", render: (r) => rupee(r.totalIn) },
                { key: "totalOut", label: "Out", align: "right", render: (r) => rupee(r.totalOut) },
                { key: "closingBalance", label: "Closing", align: "right", render: (r) => rupee(r.closingBalance) },
                { key: "transactionCount", label: "Txns", align: "right" },
              ]}
              rows={
                loading
                  ? []
                  : [
                      ...accountRows.map((r) => ({ ...r, id: r.account })),
                      balanceSheet?.grandTotal
                        ? { ...balanceSheet.grandTotal, account: "Grand total", id: "grand-total", _isTotal: true }
                        : null,
                    ].filter(Boolean)
              }
            />
          </Card>

          <Card title="Branch profitability" subtitle="All branches, regardless of the branch filter above">
            <DataTable
              loading={loading}
              emptyMessage={<EmptyState icon="▦" title="No transaction data" hint="No revenue or expense recorded for this period." />}
              columns={[
                { key: "branch", label: "Branch" },
                { key: "revenue", label: "Revenue", align: "right", render: (r) => rupee(r.revenue) },
                { key: "expense", label: "Expense", align: "right", render: (r) => rupee(r.expense) },
                { key: "profit", label: "Profit", align: "right", render: (r) => (
                  <span style={{ color: r.profit >= 0 ? "var(--pos)" : "var(--crit)", fontWeight: 600 }}>{rupee(r.profit)}</span>
                ) },
              ]}
              rows={loading ? [] : branchRows.map((r) => ({ ...r, id: r.branch }))}
            />
          </Card>

          <Card title="Daily Cash Activity" subtitle="Receipts vs payments, cash-basis — same definition as the Receipts/Payments KPIs above, just by day">
            <TrendChart data={daily.map((d) => ({ date: d.date, value: d.receipts - d.payments }))} label="Net cash" />
          </Card>

          <Card title="Jump to a page">
            <SectionLinks items={FINANCE_LINKS} />
          </Card>
        </>
      )}
    </OwnerPage>
  );
}
