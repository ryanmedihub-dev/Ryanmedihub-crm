"use client";

import { useEffect, useState } from "react";
import { ACCOUNTS } from "@/constants/bankRouting";
import { bucketMap, iso, overdueAmount, overdueCount } from "./dashboardMath";

/**
 * Owns every fetch behind the dashboard: the headline assets/liabilities/cash-flow/P&L
 * batch (re-run whenever the applied filters or period change) and the separate six-month
 * trend batch. Split out of page.jsx so the page component is just layout.
 */
export function useDashboardData({ from, to, priorFrom, priorTo, customReady, appliedAccounts, appliedBranch }) {
  const [assets, setAssets] = useState(null);
  const [liabilities, setLiabilities] = useState(null);
  const [cashFlow, setCashFlow] = useState(null);
  const [pnl, setPnl] = useState(null);
  const [priorPnl, setPriorPnl] = useState(null);
  const [grossSales, setGrossSales] = useState(null);
  const [expenseByHead, setExpenseByHead] = useState([]);
  const [expenseHeadMeta, setExpenseHeadMeta] = useState(null);
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [ageing, setAgeing] = useState({ payables: {}, receivables: {} });
  const [attention, setAttention] = useState(null);
  const [batchStatus, setBatchStatus] = useState("loading");
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    if (!customReady) return;
    let cancelled = false;
    async function run() {
      setBatchStatus("loading");
      try {
        const accountsQS =
          appliedAccounts.length < ACCOUNTS.length ? `&accounts=${appliedAccounts.join(",")}` : "";
        const branchQS = appliedBranch ? `&branch=${appliedBranch}` : "";

        const [
          cashJson, suspenseJson,
          pnlJson, priorPnlJson, headJson, ageingPayJson, ageingRecJson, unattributedJson, cashFlowJson,
          salesJson,
        ] = await Promise.all([
          fetch(`/api/close-book/accounts?to=${iso(to)}${accountsQS}${branchQS}`).then((r) => r.json()),
          fetch(`/api/suspense?groupBy=account&to=${iso(to)}${accountsQS}${branchQS}`).then((r) => r.json()),
          fetch(`/api/close-book/pnl?from=${iso(from)}&to=${iso(to)}${accountsQS}${branchQS}`).then((r) => r.json()),
          fetch(`/api/close-book/pnl?from=${iso(priorFrom)}&to=${iso(priorTo)}${accountsQS}${branchQS}`).then((r) => r.json()),
          fetch(`/api/admin/expense-by-head?from=${iso(from)}&to=${iso(to)}${accountsQS}${branchQS}`).then((r) => r.json()),
          fetch(`/api/payables/summary?ageing=1${appliedBranch ? `&branch=${appliedBranch}` : ""}`).then((r) => r.json()),
          fetch(`/api/receivables/summary?ageing=1${appliedBranch ? `&branch=${appliedBranch}` : ""}`).then((r) => r.json()),
          fetch(`/api/close-book/balance-sheet?from=1970-01-01&to=${iso(to)}${branchQS}`).then((r) => r.json()),
          fetch(`/api/close-book/cash-flow?from=${iso(from)}&to=${iso(to)}${accountsQS}${branchQS}`).then((r) => r.json()),
          fetch(`/api/admin/sales-summary?from=${iso(from)}&to=${iso(to)}${branchQS}`).then((r) => r.json()),
        ]);
        if (cancelled) return;

        // Bajaj/Fibe are financing lines, not cash — they're split out of Cash & Bank so
        // this card agrees with the cash-balance trend, which has always excluded them.
        const allRows = cashJson.rows || [];
        const cashTotal = allRows
          .filter((r) => !["Bajaj Loan", "Fibe Loan"].includes(r.key))
          .reduce((s, r) => s + (r.closing || 0), 0);
        const loanTotal = allRows
          .filter((r) => ["Bajaj Loan", "Fibe Loan"].includes(r.key))
          .reduce((s, r) => s + (r.closing || 0), 0);

        // Receivables/payables use per-document `pending` (floored at 0) — the same basis
        // as the ageing buckets and the overdue rows below, so the card is now exactly the
        // sum of the bars beside it.
        const receivablesTotal = ageingRecJson.overall?.totalPending || 0;
        const payablesTotal = ageingPayJson.overall?.totalPending || 0;
        const suspenseTotal = (suspenseJson.rows || []).reduce((s, r) => s + (r.closing || 0), 0);

        setAssets({ cashTotal, loanTotal, receivablesTotal, total: cashTotal + receivablesTotal });
        setLiabilities({ payablesTotal, suspenseTotal, total: payablesTotal + suspenseTotal });
        setCashFlow({
          receipts: cashFlowJson.receipts || 0,
          payments: cashFlowJson.payments || 0,
          balanceLeft: cashFlowJson.balanceLeft || 0,
        });
        setPnl({ income: pnlJson.income || 0, expense: pnlJson.expense || 0 });
        setPriorPnl({ income: priorPnlJson.income || 0, expense: priorPnlJson.expense || 0 });
        setGrossSales(salesJson?.success ? { total: salesJson.total || 0, byCategory: salesJson.byCategory || {} } : null);

        setExpenseByHead(headJson.rows || []);
        setExpenseHeadMeta({
          shownTotal: headJson.shownTotal ?? null,
          grandTotal: headJson.grandTotal ?? null,
        });

        setAgeing({ payables: bucketMap(ageingPayJson.byBucket), receivables: bucketMap(ageingRecJson.byBucket) });

        setAttention({
          overduePayables: { amount: overdueAmount(ageingPayJson.byBucket), count: overdueCount(ageingPayJson.byBucket) },
          overdueReceivables: { amount: overdueAmount(ageingRecJson.byBucket), count: overdueCount(ageingRecJson.byBucket) },
          suspenseCount: (suspenseJson.rows || []).reduce((s, r) => s + (r.count || 0), 0),
          unattributed: unattributedJson.unattributed || { count: 0, amount: 0 },
        });

        setLastRefreshed(new Date());
        setBatchStatus("ready");
      } catch (error) {
        if (!cancelled) {
          console.error("Dashboard fetch failed:", error);
          setBatchStatus("error");
        }
      }
    }
    run();
    return () => { cancelled = true; };
  }, [from, to, priorFrom, priorTo, customReady, appliedAccounts, appliedBranch, refreshNonce]);

  // Six-month trend, computed from the same accrual P&L endpoint as the card above, so the
  // chart and the card describe the same quantity. (It previously read transaction stats,
  // a cash-basis figure, while being labelled "Accrual".)
  useEffect(() => {
    let cancelled = false;
    async function run() {
      const now = new Date();
      const months = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const start = new Date(d.getFullYear(), d.getMonth(), 1);
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
        months.push({ label: d.toLocaleDateString("en-IN", { month: "short" }), start, end });
      }
      const accountsQS =
        appliedAccounts.length < ACCOUNTS.length ? `&accounts=${appliedAccounts.join(",")}` : "";
      const branchQS = appliedBranch ? `&branch=${appliedBranch}` : "";
      const results = await Promise.all(
        months.map((m) =>
          fetch(`/api/close-book/pnl?from=${iso(m.start)}&to=${iso(m.end)}${accountsQS}${branchQS}`)
            .then((r) => r.json())
            .catch(() => ({})),
        ),
      );
      if (cancelled) return;
      setMonthlyTrend(
        months.map((m, i) => ({
          month: m.label,
          Income: results[i]?.income || 0,
          Expense: results[i]?.expense || 0,
        })),
      );
    }
    run();
    return () => { cancelled = true; };
  }, [appliedBranch, appliedAccounts, refreshNonce]);

  return {
    assets, liabilities, cashFlow, pnl, priorPnl, grossSales,
    expenseByHead, expenseHeadMeta, monthlyTrend, ageing, attention,
    batchStatus, lastRefreshed,
    refresh: () => setRefreshNonce((n) => n + 1),
  };
}
