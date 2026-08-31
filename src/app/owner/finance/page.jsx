"use client";

import { useEffect, useState, useCallback } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, KpiRow, DataTable, ErrorState, EmptyState } from "@/components/owner";
import { ALL_BRANCHES } from "@/lib/branches";

const BRANCHES = ["All", ...ALL_BRANCHES];
const DATE_RANGES = ["Today", "Yesterday", "Last 7 Days", "Last 30 Days", "Custom"];

const rupee = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);
const fmt = (n) => new Intl.NumberFormat("en-IN").format(n || 0);

function buildDateRange(range, custom) {
  const now = new Date();
  let from = new Date(), to = new Date();
  to.setHours(23, 59, 59, 999);

  if (range === "Today") {
    from.setHours(0, 0, 0, 0);
  } else if (range === "Yesterday") {
    from = new Date(now); from.setDate(from.getDate() - 1); from.setHours(0, 0, 0, 0);
    to   = new Date(from); to.setHours(23, 59, 59, 999);
  } else if (range === "Last 7 Days") {
    from = new Date(now); from.setDate(from.getDate() - 6); from.setHours(0, 0, 0, 0);
  } else if (range === "Last 30 Days") {
    from = new Date(now); from.setDate(from.getDate() - 29); from.setHours(0, 0, 0, 0);
  } else if (range === "Custom" && custom.from) {
    from = new Date(custom.from); from.setHours(0, 0, 0, 0);
    to   = custom.to ? new Date(custom.to) : new Date(custom.from);
    to.setHours(23, 59, 59, 999);
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

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

  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const fetchData = useCallback(async () => {
    if (dateRange === "Custom" && !custom.from) return;
    setLoading(true);
    setError(null);
    try {
      const { from, to } = buildDateRange(dateRange, custom);
      const qs = new URLSearchParams({ from, to, ...(branch !== "All" ? { branch } : {}) }).toString();
      const branchQs = branch !== "All" ? `?branch=${encodeURIComponent(branch)}` : "";

      const [pnlRes, cashFlowRes, balanceSheetRes, recvRes, payRes, branchRes] = await Promise.all([
        fetch(`/api/close-book/pnl?${qs}`),
        fetch(`/api/close-book/cash-flow?${qs}`),
        fetch(`/api/close-book/balance-sheet?${qs}`),
        fetch(`/api/receivables/summary${branchQs}`),
        fetch(`/api/payables/summary${branchQs}`),
        fetch("/api/owner/finance/branch-profitability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from, to }),
        }),
      ]);

      const [pnlJson, cashFlowJson, balanceSheetJson, recvJson, payJson, branchJson] = await Promise.all([
        pnlRes.json(), cashFlowRes.json(), balanceSheetRes.json(), recvRes.json(), payRes.json(), branchRes.json(),
      ]);

      if (pnlJson.success === false || pnlJson.error) { setError(pnlJson.error || "Failed to load P&L"); return; }

      setPnl(pnlJson);
      setCashFlow(cashFlowJson);
      setBalanceSheet(balanceSheetJson);
      setReceivable(recvJson.success ? recvJson.overall : null);
      setPayable(payJson.success ? payJson.overall : null);
      setBranchRows(branchJson.success ? branchJson.rows || [] : []);
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }, [branch, dateRange, custom]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const accountRows = balanceSheet?.accounts || [];

  return (
    <div className="app">
      <OwnerSidebar />

      <div className="main">
        <OwnerTopbar
          title="Accounts, P&L & Expenses"
          subtitle="Reuses the same close-book P&L / balance sheet / cash flow logic as /admin/close-book"
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
          {error ? (
            <ErrorState message={error} onRetry={fetchData} />
          ) : (
            <>
              <KpiRow
                primaryIndex={2}
                loading={loading}
                items={[
                  { label: "Income", value: loading ? "—" : rupee(pnl?.income), sub: "Accrual", kind: "good" },
                  { label: "Expense", value: loading ? "—" : rupee(pnl?.expense), sub: "Accrual", kind: "bad" },
                  { label: "Profit", value: loading ? "—" : rupee(pnl?.profit), sub: dateRange, kind: pnl?.profit >= 0 ? "good" : "bad" },
                  { label: "Receipts", value: loading ? "—" : rupee(cashFlow?.receipts), sub: "Cash-basis", kind: "info" },
                  { label: "Payments", value: loading ? "—" : rupee(cashFlow?.payments), sub: "Cash-basis", kind: "info" },
                  { label: "Balance Left", value: loading ? "—" : rupee(cashFlow?.balanceLeft), sub: "Receipts − payments", kind: cashFlow?.balanceLeft >= 0 ? "good" : "bad" },
                  { label: "Pending Receivable", value: loading ? "—" : rupee(receivable?.totalPending), sub: `${fmt(receivable?.count ?? 0)} open`, kind: "info" },
                  { label: "Pending Payable", value: loading ? "—" : rupee(payable?.totalPending), sub: `${fmt(payable?.count ?? 0)} open`, kind: payable?.totalPending > 0 ? "warn" : "good" },
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
