"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  RefreshCw, X,
} from "lucide-react";
import AccountMultiSelect from "@/components/finance/AccountMultiSelect";
import MetricDrillPanel from "@/components/finance/MetricDrillPanel";
import { formatCurrency } from "@/lib/financeUI";
import { ACCOUNTS } from "@/constants/bankRouting";
import { ALL_BRANCHES } from "@/lib/branches";
import { AGEING_BUCKET_ORDER, iso, periodRange } from "./dashboardMath";
import { AttentionRow, BasisTag, KpiCell, KpiStrip, SectionHead } from "./DashboardCards";
import { buttonClass } from "@/components/ui";
import { useDashboardData } from "./useDashboardData";

const DashboardCharts = dynamic(() => import("@/components/finance/DashboardCharts"), {
  ssr: false,
  loading: () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="h-4 w-48 bg-gray-100 rounded animate-pulse mb-4" />
          <div className="h-65 bg-gray-50 rounded animate-pulse" />
        </div>
      ))}
    </div>
  ),
});

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

  const {
    assets, liabilities, cashFlow, pnl, priorPnl, grossSales,
    expenseByHead, expenseHeadMeta, monthlyTrend, ageing, attention,
    batchStatus, lastRefreshed, refresh,
  } = useDashboardData({ from, to, priorFrom, priorTo, customReady, appliedAccounts, appliedBranch });

  
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

  const selectCls =
    "h-9 pl-3 pr-8 border border-gray-200 rounded-lg text-sm text-gray-800 bg-white hover:border-gray-300 transition-colors focus:outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15";
  const asOfDate = new Date(to).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="min-h-screen">
      <main className="min-w-0 px-4 pb-10 sm:px-6 lg:px-8">
        {/* Header + filters (sticky) */}
        <div className="lg:sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-6 pb-4 bg-gray-50 border-b border-gray-200/70">
          <div className="flex flex-col gap-4 min-[1360px]:flex-row min-[1360px]:items-end min-[1360px]:justify-between">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold tracking-tight text-gray-900">Financial dashboard</h1>
              <p className="mt-1 text-sm text-gray-500">
                Select any figure to see the records behind it.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap min-[1360px]:flex-nowrap shrink-0">
              <select aria-label="Branch" value={draftBranch} onChange={(e) => setDraftBranch(e.target.value)} className={selectCls}>
                <option value="">All branches</option>
                {ALL_BRANCHES.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              <AccountMultiSelect options={ACCOUNTS} selected={draftAccounts} onChange={setDraftAccounts} />
              <select aria-label="Period" value={draftPreset} onChange={(e) => setDraftPreset(e.target.value)} className={selectCls}>
                <option value="month">This month</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
                <option value="custom">Custom range</option>
              </select>
              {draftPreset === "custom" && (
                <>
                  <input
                    type="date"
                    aria-label="From date"
                    value={draftCustomRange.from}
                    onChange={(e) => setDraftCustomRange((c) => ({ ...c, from: e.target.value }))}
                    className={selectCls + " pr-3"}
                  />
                  <input
                    type="date"
                    aria-label="To date"
                    value={draftCustomRange.to}
                    min={draftCustomRange.from}
                    onChange={(e) => setDraftCustomRange((c) => ({ ...c, to: e.target.value }))}
                    className={selectCls + " pr-3"}
                  />
                </>
              )}
              <button
                onClick={applyFilters}
                disabled={!isDirty}
                type="button"
                className={buttonClass(isDirty ? "primary" : "secondary", "md")}
              >
                Apply
              </button>
              <button onClick={refresh} type="button" title="Refresh" aria-label="Refresh" className={buttonClass("secondary", "icon")}>
                <RefreshCw className={`w-4 h-4 text-gray-500 ${batchStatus === "loading" ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
          {(activeFilterChips.length > 0 || lastRefreshed) && (
            <div className="mt-3 flex flex-wrap items-center gap-2 min-h-6">
              {activeFilterChips.map((chip) => (
                <span key={chip.key} className="inline-flex items-center gap-1 h-6 pl-2 pr-1 bg-white text-gray-700 rounded-md text-xs font-medium border border-gray-200">
                  {chip.label}
                  <button type="button" onClick={chip.clear} aria-label={`Clear ${chip.label}`} className="p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {activeFilterChips.length > 0 && (
                <button type="button" onClick={resetFilters} className="text-xs font-medium text-gray-500 hover:text-gray-800">
                  Reset all
                </button>
              )}
              {lastRefreshed && (
                <span className="ml-auto text-xs text-gray-400 tabular-nums">
                  Updated {lastRefreshed.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Balance sheet */}
        <section className="mt-6" aria-label="Balance sheet">
          <SectionHead title="Balance sheet" aside={`As of ${asOfDate}`} />
          <KpiStrip cols="lg:grid-cols-3">
            <KpiCell
              size="lg"
              onDrill={() => openDrill("assets", "Total Assets", assets?.total)}
              title="Total assets"
              value={assets ? formatCurrency(assets.total) : null}
              subtitle="Cash & bank + receivables outstanding"
              status={batchStatus}
              onRetry={refresh}
            />
            <KpiCell
              size="lg"
              onDrill={() => openDrill("liabilities", "Total Liabilities", liabilities?.total)}
              title="Total liabilities"
              value={liabilities ? formatCurrency(liabilities.total) : null}
              subtitle="Payables outstanding + open suspense"
              status={batchStatus}
              onRetry={refresh}
            />
            <KpiCell
              size="lg"
              onDrill={() => openDrill("net-position", "Net Position", netPosition)}
              title="Net position"
              value={netPosition != null ? formatCurrency(netPosition) : null}
              subtitle="Assets minus liabilities"
              tone={netPosition < 0 ? "negative" : undefined}
              status={batchStatus}
              onRetry={refresh}
            />
          </KpiStrip>
          <KpiStrip cols="lg:grid-cols-5" className="mt-3">
            <KpiCell
              onDrill={() => openDrill("cash-bank", "Cash & Bank", assets?.cashTotal)}
              title="Cash & bank"
              value={assets ? formatCurrency(assets.cashTotal) : null}
              subtitle="Excludes Bajaj / Fibe"
              status={batchStatus}
            />
            <KpiCell
              onDrill={() => openDrill("loans", "Loan / financing", assets?.loanTotal)}
              title="Loan / financing"
              value={assets ? formatCurrency(assets.loanTotal) : null}
              subtitle="Bajaj + Fibe balances"
              tone={assets?.loanTotal < 0 ? "negative" : undefined}
              status={batchStatus}
            />
            <KpiCell
              onDrill={() => openDrill("receivables", "Receivables", assets?.receivablesTotal)}
              title="Receivables"
              value={assets ? formatCurrency(assets.receivablesTotal) : null}
              subtitle={obligationNote || "Outstanding"}
              status={batchStatus}
            />
            <KpiCell
              onDrill={() => openDrill("payables", "Payables", liabilities?.payablesTotal)}
              title="Payables"
              value={liabilities ? formatCurrency(liabilities.payablesTotal) : null}
              subtitle={obligationNote || "Outstanding"}
              status={batchStatus}
            />
            <KpiCell
              onDrill={() => openDrill("suspense", "Suspense", liabilities?.suspenseTotal)}
              title="Suspense"
              value={liabilities ? formatCurrency(liabilities.suspenseTotal) : null}
              subtitle="Open entries"
              status={batchStatus}
            />
          </KpiStrip>
        </section>

        {/* P&L + cash flow */}
        <div className="mt-8 grid grid-cols-1 2xl:grid-cols-7 gap-x-6 gap-y-8">
          <section className="2xl:col-span-4" aria-label="Profit and loss">
            <SectionHead
              title={`Profit & loss · ${periodLabel}`}
              basis="Accrual"
              explain={
                <>
                  Income = direct sales + receivables raised this period, minus what&apos;s double-counted against them.
                  Expense = direct expenses + payables raised this period, minus what&apos;s double-counted against them.
                  Gross sales = transplant + service + medicine booked this period (cash + credit).
                  {accountFilterActive && " The account filter narrows the transaction half only; receivables and payables have no account of their own."}
                </>
              }
            />
            <KpiStrip cols="lg:grid-cols-4">
              <KpiCell
                onDrill={() => openDrill("gross-sales", `Gross Sales — ${periodLabel}`, grossSales?.total)}
                title="Gross sales"
                value={grossSales ? formatCurrency(grossSales.total) : null}
                subtitle="Booked, cash + credit"
                status={batchStatus}
              />
              {[
                { label: "Income", value: pnl?.income, prior: priorPnl?.income, metric: "pnl-income" },
                { label: "Expense", value: pnl?.expense, prior: priorPnl?.expense, metric: "pnl-expense" },
                { label: "Profit", value: profit, prior: priorProfit, metric: null },
              ].map((row) => {
                const g = growth(row.value, row.prior);
                return (
                  <KpiCell
                    key={row.label}
                    onDrill={row.metric ? () => openDrill(row.metric, `${row.label} — ${periodLabel}`, row.value) : undefined}
                    title={row.label}
                    value={row.value != null ? formatCurrency(row.value) : null}
                    tone={row.label === "Profit" && row.value < 0 ? "negative" : undefined}
                    subtitle={
                      row.prior != null
                        ? `Prior ${formatCurrency(row.prior)}${g == null ? "" : ` · ${g >= 0 ? "+" : ""}${g}%`}`
                        : undefined
                    }
                    status={batchStatus}
                  />
                );
              })}
            </KpiStrip>
          </section>

          <section className="2xl:col-span-3" aria-label="Cash flow">
            <SectionHead
              title={`Cash flow · ${periodLabel}`}
              basis="Cash"
              explain="Every receipt and payment posted to your bank and further-mode accounts, excluding contra transfers between your own accounts. Net is receipts minus payments for the period. It is not the closing Cash & Bank balance, which also carries the opening balance, transfers, suspense and borrowings."
            />
            <KpiStrip cols="lg:grid-cols-3">
              {[
                { label: "Receipts", metric: "receipts", value: cashFlow?.receipts },
                { label: "Payments", metric: "payments", value: cashFlow?.payments },
                { label: "Net for period", metric: null, value: cashFlow?.balanceLeft },
              ].map((row) => (
                <KpiCell
                  key={row.label}
                  onDrill={row.metric ? () => openDrill(row.metric, `${row.label} — ${periodLabel}`, row.value) : undefined}
                  title={row.label}
                  value={cashFlow ? formatCurrency(row.value) : null}
                  tone={row.metric === null && row.value < 0 ? "negative" : undefined}
                  status={batchStatus}
                />
              ))}
            </KpiStrip>
          </section>
        </div>

        {/* Trends, attention, breakdowns */}
        <div className="mt-8">
          <DashboardCharts
            expenseByHead={expenseByHead}
            expenseHeadMeta={expenseHeadMeta}
            monthlyTrend={monthlyTrend}
            ageingChartData={ageingChartData}
            batchStatus={batchStatus}
            onDrillExpenseHead={(head, value) => openDrill("pnl-expense", `Expense — ${head}`, value, { head })}
            onDrillAgeing={(kind, bucket, value) =>
              openDrill(kind, `${kind === "payables" ? "Payables" : "Receivables"} — ${bucket}`, value, { bucket })
            }
            basisTag={<BasisTag>Accrual</BasisTag>}
            attention={
              <section className="bg-white rounded-xl border border-gray-200 h-full flex flex-col" aria-label="Needs attention">
                <header className="px-5 pt-4 pb-3 border-b border-gray-100">
                  <h2 className="text-[15px] font-semibold text-gray-900">Needs attention</h2>
                </header>
                <div className="divide-y divide-gray-100 flex-1">
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
                    label="Unclassified suspense entries"
                    count={attention?.suspenseCount}
                    onDrill={() => openDrill("suspense", "Unreclassified suspense entries", liabilities?.suspenseTotal)}
                  />
                  <AttentionRow
                    label="Transactions without an account (all time)"
                    count={attention?.unattributed?.count}
                    amount={attention?.unattributed?.amount}
                    onDrill={() => openDrill("unattributed", "Transactions missing account attribution", attention?.unattributed?.amount)}
                  />
                  {batchStatus === "loading" && !attention && (
                    <div className="p-5 space-y-3">
                      {[0, 1, 2].map((i) => <div key={i} className="h-9 bg-gray-100 rounded animate-pulse" />)}
                    </div>
                  )}
                  {attention && !attention.overduePayables?.count && !attention.overdueReceivables?.count &&
                    !attention.suspenseCount && !attention.unattributed?.count && (
                      <p className="text-sm text-gray-500 px-5 py-6">Nothing needs attention right now.</p>
                    )}
                </div>
              </section>
            }
          />
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
