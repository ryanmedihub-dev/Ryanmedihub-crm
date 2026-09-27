"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, KpiRow, DataTable, ErrorState, EmptyState, TrendChart } from "@/components/owner";
import { AiBriefPanel } from "@/components/owner/ai";
import { useAiInsight } from "@/lib/ai/client/useAiInsight";
import { ownerFetch } from "@/lib/ownerFetch";
import { rupee, num as fmt } from "@/lib/owner/format";
import { OWNER_BRANCHES as BRANCHES, DATE_RANGES, buildDateRange } from "@/lib/owner/filters";

const FINANCE_LINKS = [
  { href: "/owner/finance/transactions", label: "All Transactions", note: "Full transaction report" },
  { href: "/owner/finance/expenses", label: "Expenses", note: "By head/sub-type + marketing reconciliation" },
  { href: "/owner/finance/assets", label: "Assets", note: "Receivables, aging" },
  { href: "/owner/finance/liabilities", label: "Liabilities", note: "Payables by purpose, overdue" },
  { href: "/owner/finance/salary-incentive", label: "Salary & Incentive", note: "Per employee, agrees with Part 1" },
  { href: "/owner/finance/rent", label: "Rent", note: "Per property, overdue" },
];

export default function OwnerFinancePage() {
  const [branch, setBranch]       = useState("All");
  const [dateRange, setDateRange] = useState("Last 30 Days");
  const [custom, setCustom]       = useState({ from: "", to: "" });

  const [pnl, setPnl]                 = useState(null);
  const [cashFlow, setCashFlow]       = useState(null);
  const [balanceSheet, setBalanceSheet] = useState(null);
  const [receivable, setReceivable]   = useState(null);
  const [payable, setPayable]         = useState(null);
  const [branchRows, setBranchRows]   = useState([]);
  const [daily, setDaily]             = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const aiScope = useMemo(() => {
    if (dateRange === "Custom" && !custom.from) return {};
    const { from, to } = buildDateRange(dateRange, custom);
    return { from, to, branch };
  }, [dateRange, custom, branch]);
  const overviewAi = useAiInsight("finance.overview", aiScope, { kind: "brief", enabled: !!aiScope.from });

  const fetchData = useCallback(async ({ signal } = {}) => {
    if (dateRange === "Custom" && !custom.from) return;
    setLoading(true);
    setError(null);
    const { from, to } = buildDateRange(dateRange, custom);
    const qs = new URLSearchParams({ from, to, ...(branch !== "All" ? { branch } : {}) }).toString();
    const branchQs = branch !== "All" ? `?branch=${encodeURIComponent(branch)}` : "";

    const [pnlR, cashFlowR, balanceSheetR, recvR, payR, branchR, trendR] = await Promise.all([
      ownerFetch(`/api/close-book/pnl?${qs}`, { signal }),
      ownerFetch(`/api/close-book/cash-flow?${qs}`, { signal }),
      ownerFetch(`/api/close-book/balance-sheet?${qs}`, { signal }),
      ownerFetch(`/api/receivables/summary${branchQs}`, { signal }),
      ownerFetch(`/api/payables/summary${branchQs}`, { signal }),
      ownerFetch("/api/owner/finance/branch-profitability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
        signal,
      }),
      ownerFetch(`/api/owner/finance/trend?${qs}`, { signal }),
    ]);

    if ([pnlR, cashFlowR, balanceSheetR, recvR, payR, branchR, trendR].some((r) => r.aborted)) return;

    
    if (!pnlR.ok || pnlR.data?.error) {
      setError(pnlR.error || pnlR.data?.error || "Failed to load P&L");
      setLoading(false);
      return;
    }

    setPnl(pnlR.data);
    setCashFlow(cashFlowR.ok ? cashFlowR.data : null);
    setBalanceSheet(balanceSheetR.ok ? balanceSheetR.data : null);
    setReceivable(recvR.ok ? recvR.data?.overall ?? null : null);
    setPayable(payR.ok ? payR.data?.overall ?? null : null);
    setBranchRows(branchR.ok ? branchR.data?.rows || [] : []);
    setDaily(trendR.ok ? trendR.data?.daily || [] : []);
    setLoading(false);
  }, [branch, dateRange, custom]);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchData({ signal: ctrl.signal });
    return () => ctrl.abort();
  }, [fetchData]);

  const accountRows = balanceSheet?.accounts || [];

  return (
    <div className="app">
      <OwnerSidebar />

      <div className="main">
        <OwnerTopbar
          title="Accounts, P&L & Expenses"
          subtitle="Reuses the same close-book P&L / balance sheet / cash flow logic as /admin/close-book"
          aiState={overviewAi}
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
                  <input type="date" className="control" value={custom.from} onChange={(e) => setCustom((p) => ({ ...p, from: e.target.value }))} />
                  <input type="date" className="control" value={custom.to} onChange={(e) => setCustom((p) => ({ ...p, to: e.target.value }))} />
                </>
              )}
              <button className="icon-btn" onClick={fetchData} disabled={loading} title="Refresh">
                {loading ? "…" : "⟳"}
              </button>
            </>
          }
        />

        <div className="content">
          <AiBriefPanel feature="finance.overview" scope={aiScope} title="Finance" variant="hero" scoreLabel="Financial Health" enabled={!!aiScope.from} aiState={overviewAi} />

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
                <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
                  {FINANCE_LINKS.map((it) => (
                    <Link key={it.href} href={it.href} className="card" style={{ display: "block", textDecoration: "none" }}>
                      <div className="card-title">
                        <div>
                          <h3>{it.label}</h3>
                          <p>{it.note}</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
