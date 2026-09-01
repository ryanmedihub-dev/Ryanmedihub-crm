"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Landmark, ScrollText, Scale, AlertTriangle, ArrowRight, ArrowUpRight, Filter, HandCoins,
  Wallet, HelpCircle, TrendingUp, TrendingDown, RefreshCw, X, CreditCard,
} from "lucide-react";
import AccountMultiSelect from "@/components/finance/AccountMultiSelect";
import MetricDrillPanel from "@/components/finance/MetricDrillPanel";
import { formatCurrency } from "@/lib/financeUI";
import { ACCOUNTS } from "@/constants/bankRouting";
import { ALL_BRANCHES } from "@/lib/branches";

const LOAN_ACCOUNTS = ["Bajaj Loan", "Fibe Loan"];

// Written out in full — Tailwind can't see class names built by string interpolation.
const CASH_TONES = {
  emerald: { box: "border-emerald-100 bg-emerald-50/40", label: "text-emerald-700", icon: "text-emerald-300" },
  rose: { box: "border-rose-100 bg-rose-50/40", label: "text-rose-700", icon: "text-rose-300" },
  indigo: { box: "border-indigo-100 bg-indigo-50/40", label: "text-indigo-700", icon: "text-indigo-300" },
};

const DashboardCharts = dynamic(() => import("@/components/finance/DashboardCharts"), {
  ssr: false,
  loading: () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="h-4 w-48 bg-gray-100 rounded animate-pulse mb-4" />
          <div className="h-65 bg-gray-50 rounded animate-pulse" />
        </div>
      ))}
    </div>
  ),
});

function periodRange(preset, custom) {
  let to = new Date();
  to.setHours(23, 59, 59, 999);
  let from;
  if (preset === "custom" && custom?.from) {
    from = new Date(custom.from);
    from.setHours(0, 0, 0, 0);
    to = custom.to ? new Date(custom.to) : new Date(custom.from);
    to.setHours(23, 59, 59, 999);
  } else if (preset === "30") {
    from = new Date();
    from.setDate(from.getDate() - 29);
    from.setHours(0, 0, 0, 0);
  } else if (preset === "90") {
    from = new Date();
    from.setDate(from.getDate() - 89);
    from.setHours(0, 0, 0, 0);
  } else {
    from = new Date(to.getFullYear(), to.getMonth(), 1);
    from.setHours(0, 0, 0, 0);
  }
  const lengthMs = Math.max(to.getTime() - from.getTime(), 0);
  const priorTo = new Date(from.getTime() - 1);
  const priorFrom = new Date(priorTo.getTime() - lengthMs);
  return { from, to, priorFrom, priorTo };
}

const iso = (d) => d.toISOString().slice(0, 10);

const AGEING_BUCKET_ORDER = ["current", "1-30", "31-60", "61-90", "90+"];

const bucketMap = (rows) => {
  const map = {};
  (rows || []).forEach((r) => {
    if (r._id) map[r._id] = (map[r._id] || 0) + (r.totalPending || 0);
  });
  return map;
};
const overdueAmount = (rows) =>
  (rows || []).filter((r) => r._id && r._id !== "current").reduce((s, r) => s + (r.totalPending || 0), 0);
const overdueCount = (rows) =>
  (rows || []).filter((r) => r._id && r._id !== "current").reduce((s, r) => s + (r.count || 0), 0);

function BasisTag({ children }) {
  return (
    <span className="inline-block text-[10px] font-semibold uppercase tracking-wide text-gray-400 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5">
      {children}
    </span>
  );
}

function DashboardCard({ onDrill, title, basis, value, icon: Icon, color, subtitle, status = "ready", onRetry }) {
  const body = (
    <div
      className={`group relative bg-white rounded-2xl shadow-sm p-4 sm:p-6 transition-all duration-200 h-full text-left ${
        onDrill ? "hover:shadow-md hover:-translate-y-0.5" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2.5 rounded-lg bg-linear-to-r ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        {onDrill && (
          <ArrowUpRight className="w-4 h-4 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>
      <div className="flex items-center gap-2 mb-1">
        <p className="text-gray-600 text-sm font-medium">{title}</p>
        {basis && <BasisTag>{basis}</BasisTag>}
      </div>
      {status === "loading" ? (
        <div className="h-7 w-28 bg-gray-100 rounded animate-pulse mt-1" />
      ) : status === "error" ? (
        <div className="flex items-center gap-2">
          <span className="text-sm text-rose-600">Failed to load</span>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRetry?.();
            }}
            className="text-xs font-semibold text-indigo-600 hover:underline"
          >
            Retry
          </button>
        </div>
      ) : (
        <p className="text-xl font-bold text-gray-900">
          {value === null || value === undefined ? "No data for this period" : value}
        </p>
      )}
      {subtitle && <p className="text-xs text-gray-400 mt-1.5">{subtitle}</p>}
    </div>
  );
  return onDrill ? (
    <button
      type="button"
      onClick={onDrill}
      className="block h-full w-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
    >
      {body}
    </button>
  ) : (
    body
  );
}

export default function AdminDashboard() {
  const [draftPreset, setDraftPreset] = useState("month");
  const [draftCustomRange, setDraftCustomRange] = useState({ from: "", to: "" });
  const [draftAccounts, setDraftAccounts] = useState(ACCOUNTS);
  const [draftBranch, setDraftBranch] = useState("");

  const [appliedPreset, setAppliedPreset] = useState("month");
  const [appliedCustomRange, setAppliedCustomRange] = useState({ from: "", to: "" });
  const [appliedAccounts, setAppliedAccounts] = useState(ACCOUNTS);
  const [appliedBranch, setAppliedBranch] = useState("");

  const isDirty =
    draftPreset !== appliedPreset ||
    draftCustomRange.from !== appliedCustomRange.from ||
    draftCustomRange.to !== appliedCustomRange.to ||
    draftAccounts.length !== appliedAccounts.length ||
    draftAccounts.some((a) => !appliedAccounts.includes(a)) ||
    draftBranch !== appliedBranch;

  const applyFilters = () => {
    setAppliedPreset(draftPreset);
    setAppliedCustomRange(draftCustomRange);
    setAppliedAccounts(draftAccounts);
    setAppliedBranch(draftBranch);
  };

  const resetFilters = () => {
    setDraftPreset("month");
    setDraftCustomRange({ from: "", to: "" });
    setDraftAccounts(ACCOUNTS);
    setDraftBranch("");
    setAppliedPreset("month");
    setAppliedCustomRange({ from: "", to: "" });
    setAppliedAccounts(ACCOUNTS);
    setAppliedBranch("");
  };

  const customReady = appliedPreset !== "custom" || !!appliedCustomRange.from;
  const { from, to, priorFrom, priorTo } = useMemo(
    () => periodRange(appliedPreset, appliedCustomRange),
    [appliedPreset, appliedCustomRange],
  );

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

  // the card whose underlying rows are open in the drill panel
  const [drill, setDrill] = useState(null);

  const accountFilterActive = appliedAccounts.length < ACCOUNTS.length;

  const drillFilters = useMemo(
    () => ({
      branch: appliedBranch,
      from: iso(from),
      to: iso(to),
      accounts: accountFilterActive ? appliedAccounts.join(",") : "",
    }),
    [appliedBranch, from, to, accountFilterActive, appliedAccounts],
  );

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
          .filter((r) => !LOAN_ACCOUNTS.includes(r.key))
          .reduce((s, r) => s + (r.closing || 0), 0);
        const loanTotal = allRows
          .filter((r) => LOAN_ACCOUNTS.includes(r.key))
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

  const netPosition = assets && liabilities ? assets.total - liabilities.total : null;
  const profit = pnl ? pnl.income - pnl.expense : null;
  const priorProfit = priorPnl ? priorPnl.income - priorPnl.expense : null;
  const growth = (curr, prior) => (prior > 0 ? Math.round(((curr - prior) / prior) * 100) : null);

  const ageingChartData = AGEING_BUCKET_ORDER.map((b) => ({
    bucket: b,
    Payables: ageing.payables[b] || 0,
    Receivables: ageing.receivables[b] || 0,
  }));

  const periodLabel =
    appliedPreset === "month" ? "This Month"
    : appliedPreset === "30" ? "Last 30 Days"
    : appliedPreset === "90" ? "Last 90 Days"
    : appliedCustomRange.from
      ? `${new Date(appliedCustomRange.from).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} – ${
          appliedCustomRange.to ? new Date(appliedCustomRange.to).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "…"
        }`
      : "Custom Range";

  const asOf = `As of ${new Date(to).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`;
  const openDrill = (metric, label, cardValue, extra = {}) =>
    setDrill({ metric, label, cardValue, ...extra });

  const activeFilterChips = [
    appliedBranch && { key: "branch", label: appliedBranch, clear: () => { setDraftBranch(""); setAppliedBranch(""); } },
    appliedPreset !== "month" && {
      key: "period",
      label: periodLabel,
      clear: () => { setDraftPreset("month"); setAppliedPreset("month"); setDraftCustomRange({ from: "", to: "" }); setAppliedCustomRange({ from: "", to: "" }); },
    },
    accountFilterActive && {
      key: "accounts",
      label: `${appliedAccounts.length} accounts`,
      clear: () => { setDraftAccounts(ACCOUNTS); setAppliedAccounts(ACCOUNTS); },
    },
  ].filter(Boolean);

  const obligationNote = accountFilterActive
    ? "Has no account of its own — unaffected by the account filter"
    : undefined;

  return (
    <div className="flex min-h-screen bg-[#f8f9fc]">
      <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-[#f8f9fc]/95 backdrop-blur-sm border-b border-gray-100 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Financial Dashboard</h1>
              <p className="text-sm text-gray-500 mt-1">
                Assets, liabilities, and P&amp;L at a glance — click any figure to see the records behind it.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={draftBranch}
                onChange={(e) => setDraftBranch(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white shadow-sm"
              >
                <option value="">All branches</option>
                {ALL_BRANCHES.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              <AccountMultiSelect
                options={ACCOUNTS}
                selected={draftAccounts}
                onChange={setDraftAccounts}
              />
              <select
                value={draftPreset}
                onChange={(e) => setDraftPreset(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white shadow-sm"
              >
                <option value="month">This Month</option>
                <option value="30">Last 30 Days</option>
                <option value="90">Last 90 Days</option>
                <option value="custom">Custom Range</option>
              </select>
              {draftPreset === "custom" && (
                <>
                  <input
                    type="date"
                    value={draftCustomRange.from}
                    onChange={(e) => setDraftCustomRange((c) => ({ ...c, from: e.target.value }))}
                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white shadow-sm"
                  />
                  <input
                    type="date"
                    value={draftCustomRange.to}
                    min={draftCustomRange.from}
                    onChange={(e) => setDraftCustomRange((c) => ({ ...c, to: e.target.value }))}
                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white shadow-sm"
                  />
                </>
              )}
              <button
                onClick={applyFilters}
                disabled={!isDirty}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl shadow-sm hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Filter className="w-3.5 h-3.5" /> Apply
              </button>
              <button
                onClick={() => setRefreshNonce((n) => n + 1)}
                title="Refresh"
                className="p-2 border border-gray-200 rounded-xl bg-white shadow-sm hover:bg-gray-50"
              >
                <RefreshCw className={`w-4 h-4 text-gray-500 ${batchStatus === "loading" ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {activeFilterChips.map((chip) => (
              <span key={chip.key} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium border border-indigo-100">
                {chip.label}
                <button onClick={chip.clear} className="p-0.5 rounded-full hover:bg-indigo-100">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {activeFilterChips.length > 0 && (
              <button onClick={resetFilters} className="text-xs font-medium text-gray-500 hover:text-gray-700">
                Reset all
              </button>
            )}
            {lastRefreshed && (
              <span className="ml-auto text-xs text-gray-400">
                Last refreshed {lastRefreshed.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <DashboardCard
            onDrill={() => openDrill("assets", "Total Assets", assets?.total)}
            title="Total Assets"
            basis={asOf}
            value={assets ? formatCurrency(assets.total) : null}
            icon={Landmark}
            color="from-emerald-500 to-emerald-600"
            subtitle="Cash & bank + receivables outstanding"
            status={batchStatus}
            onRetry={() => setRefreshNonce((n) => n + 1)}
          />
          <DashboardCard
            onDrill={() => openDrill("liabilities", "Total Liabilities", liabilities?.total)}
            title="Total Liabilities"
            basis={asOf}
            value={liabilities ? formatCurrency(liabilities.total) : null}
            icon={ScrollText}
            color="from-rose-500 to-rose-600"
            subtitle="Payables outstanding + open suspense"
            status={batchStatus}
            onRetry={() => setRefreshNonce((n) => n + 1)}
          />
          <DashboardCard
            onDrill={() => openDrill("net-position", "Net Position", netPosition)}
            title="Net Position"
            basis={asOf}
            value={netPosition != null ? formatCurrency(netPosition) : null}
            icon={Scale}
            color={netPosition >= 0 ? "from-indigo-500 to-indigo-600" : "from-red-500 to-red-600"}
            status={batchStatus}
            onRetry={() => setRefreshNonce((n) => n + 1)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <DashboardCard
            onDrill={() => openDrill("cash-bank", "Cash & Bank", assets?.cashTotal)}
            title="Cash & Bank"
            basis={asOf}
            value={assets ? formatCurrency(assets.cashTotal) : null}
            icon={Landmark}
            color="from-emerald-400 to-emerald-500"
            subtitle="Excludes Bajaj / Fibe financing"
            status={batchStatus}
          />
          <DashboardCard
            onDrill={() => openDrill("loans", "Loan / financing", assets?.loanTotal)}
            title="Loan / Financing"
            basis={asOf}
            value={assets ? formatCurrency(assets.loanTotal) : null}
            icon={CreditCard}
            color="from-violet-400 to-violet-500"
            subtitle="Bajaj + Fibe balances"
            status={batchStatus}
          />
          <DashboardCard
            onDrill={() => openDrill("receivables", "Receivables", assets?.receivablesTotal)}
            title="Receivables"
            basis="Outstanding"
            value={assets ? formatCurrency(assets.receivablesTotal) : null}
            icon={HandCoins}
            color="from-teal-400 to-teal-500"
            status={batchStatus}
            subtitle={obligationNote}
          />
          <DashboardCard
            onDrill={() => openDrill("payables", "Payables", liabilities?.payablesTotal)}
            title="Payables"
            basis="Outstanding"
            value={liabilities ? formatCurrency(liabilities.payablesTotal) : null}
            icon={Wallet}
            color="from-rose-400 to-rose-500"
            status={batchStatus}
            subtitle={obligationNote}
          />
          <DashboardCard
            onDrill={() => openDrill("suspense", "Suspense", liabilities?.suspenseTotal)}
            title="Suspense"
            basis={asOf}
            value={liabilities ? formatCurrency(liabilities.suspenseTotal) : null}
            icon={HelpCircle}
            color="from-amber-400 to-amber-500"
            status={batchStatus}
          />
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
              Profit &amp; Loss — {periodLabel}
            </h2>
            <BasisTag>Accrual</BasisTag>
          </div>
          <p className="text-xs text-gray-400 mb-4">
            Income = direct sales + receivables raised this period, minus what&apos;s double-counted
            against them. Expense = direct expenses + payables raised this period, minus what&apos;s
            double-counted against them.
            {accountFilterActive && " The account filter narrows the transaction half only — receivables and payables have no account of their own."}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <button
              type="button"
              onClick={() => openDrill("gross-sales", `Gross Sales — ${periodLabel}`, grossSales?.total)}
              className="group border border-emerald-100 bg-emerald-50/40 rounded-xl p-4 text-left w-full transition-all hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs text-emerald-700 font-semibold uppercase tracking-wide">Gross Sales</p>
                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-300 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              {batchStatus === "loading" ? (
                <div className="h-6 w-24 bg-emerald-100/60 rounded animate-pulse mt-1" />
              ) : (
                <p className="text-xl font-bold text-gray-900 mt-1">
                  {grossSales ? formatCurrency(grossSales.total) : "No data for this period"}
                </p>
              )}
              <p className="text-xs text-gray-400 mt-1">
                Transplant + Service + Medicine booked this period (cash + credit)
              </p>
            </button>
            {[
              { label: "Income", value: pnl?.income, prior: priorPnl?.income, metric: "pnl-income", Trend: TrendingUp },
              { label: "Expense", value: pnl?.expense, prior: priorPnl?.expense, metric: "pnl-expense", Trend: TrendingDown },
              { label: "Profit", value: profit, prior: priorProfit, metric: null, Trend: TrendingUp },
            ].map((row) => {
              const g = growth(row.value, row.prior);
              const clickable = !!row.metric;
              return (
                <button
                  key={row.label}
                  type="button"
                  disabled={!clickable}
                  onClick={clickable ? () => openDrill(row.metric, `${row.label} — ${periodLabel}`, row.value) : undefined}
                  className={`group border border-gray-100 rounded-xl p-4 text-left w-full transition-all ${
                    clickable ? "hover:shadow-sm hover:border-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400" : "cursor-default"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-400 uppercase tracking-wide">{row.label}</p>
                    {clickable && (
                      <ArrowUpRight className="w-3.5 h-3.5 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </div>
                  {batchStatus === "loading" ? (
                    <div className="h-6 w-24 bg-gray-100 rounded animate-pulse mt-1" />
                  ) : (
                    <p className="text-xl font-bold text-gray-900 mt-1">
                      {row.value != null ? formatCurrency(row.value) : "No data for this period"}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {row.prior != null ? (
                      g == null ? (
                        <>Prior period: {formatCurrency(row.prior)} (—)</>
                      ) : (
                        <>Prior period: {formatCurrency(row.prior)} ({g >= 0 ? "+" : ""}{g}%)</>
                      )
                    ) : null}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
              Cash Flow — {periodLabel}
            </h2>
            <BasisTag>Cash</BasisTag>
          </div>
          <p className="text-xs text-gray-400 mb-4">
            Every positive (Receipts) and negative (Payments) transaction posted to your bank/
            further-mode accounts, excluding internal contra transfers between your own accounts.
            Balance Left is receipts − payments for the period, not the closing balance of Cash
            &amp; Bank (which also carries the opening balance, transfers, suspense and borrowings).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: "Receipts", metric: "receipts", value: cashFlow?.receipts, tone: CASH_TONES.emerald },
              { label: "Payments", metric: "payments", value: cashFlow?.payments, tone: CASH_TONES.rose },
              { label: "Balance Left", metric: null, value: cashFlow?.balanceLeft, tone: CASH_TONES.indigo },
            ].map((row) => (
              <button
                key={row.label}
                type="button"
                disabled={!row.metric}
                onClick={row.metric ? () => openDrill(row.metric, `${row.label} — ${periodLabel}`, row.value) : undefined}
                className={`group block w-full text-left border rounded-xl p-4 transition-all ${row.tone.box} ${
                  row.metric ? "hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400" : "cursor-default"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className={`text-xs font-semibold uppercase tracking-wide ${row.tone.label}`}>{row.label}</p>
                  {row.metric && (
                    <ArrowUpRight className={`w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity ${row.tone.icon}`} />
                  )}
                </div>
                {batchStatus === "loading" ? (
                  <div className="h-6 w-24 bg-gray-100 rounded animate-pulse mt-1" />
                ) : (
                  <p className="text-xl font-bold text-gray-900 mt-1">
                    {cashFlow ? formatCurrency(row.value) : "No data for this period"}
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>

        <DashboardCharts
          expenseByHead={expenseByHead}
          expenseHeadMeta={expenseHeadMeta}
          monthlyTrend={monthlyTrend}
          ageingChartData={ageingChartData}
          batchStatus={batchStatus}
          onDrillExpenseHead={(head, value) =>
            openDrill("pnl-expense", `Expense — ${head}`, value, { head })
          }
          onDrillAgeing={(kind, bucket, value) =>
            openDrill(kind, `${kind === "payables" ? "Payables" : "Receivables"} — ${bucket}`, value, { bucket })
          }
          basisTag={<BasisTag>Accrual</BasisTag>}
        />

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">Needs Attention</h2>
          <div className="space-y-2">
            <AttentionRow
              label="Overdue payables"
              count={attention?.overduePayables?.count}
              amount={attention?.overduePayables?.amount}
              onDrill={() => openDrill("overdue-payables", "Overdue payables", attention?.overduePayables?.amount)}
            />
            <AttentionRow
              label="Overdue receivables"
              count={attention?.overdueReceivables?.count}
              amount={attention?.overdueReceivables?.amount}
              onDrill={() => openDrill("overdue-receivables", "Overdue receivables", attention?.overdueReceivables?.amount)}
            />
            <AttentionRow
              label="Unreclassified suspense entries"
              count={attention?.suspenseCount}
              onDrill={() => openDrill("suspense", "Unreclassified suspense entries", liabilities?.suspenseTotal)}
            />
            <AttentionRow
              label="Transactions missing account attribution (all-time)"
              count={attention?.unattributed?.count}
              amount={attention?.unattributed?.amount}
              onDrill={() => openDrill("unattributed", "Transactions missing account attribution", attention?.unattributed?.amount)}
            />
            {attention && !attention.overduePayables?.count && !attention.overdueReceivables?.count &&
              !attention.suspenseCount && !attention.unattributed?.count && (
                <p className="text-sm text-gray-400 py-2">Nothing needs attention right now.</p>
              )}
          </div>
        </div>
      </main>

      {drill && (
        <MetricDrillPanel
          metric={drill.metric}
          label={drill.label}
          cardValue={drill.cardValue}
          head={drill.head}
          bucket={drill.bucket}
          filters={drillFilters}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  );
}

function AttentionRow({ label, count, amount, onDrill }) {
  if (!count) return null;
  return (
    <button
      type="button"
      onClick={onDrill}
      className="flex items-center justify-between w-full p-3 rounded-xl hover:bg-gray-50 border border-gray-100 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
        <span className="text-sm text-gray-700">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-gray-900">
          {count}
          {amount != null ? ` · ${formatCurrency(amount)}` : ""}
        </span>
        <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
      </div>
    </button>
  );
}
