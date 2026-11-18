"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { formatCurrency } from "@/lib/financeUI";
import { useChartColors } from "@/lib/theme";

// Inflow = accent, outflow = amber (validated pair per accent; see globals.css --chart-in/out).
const ANIM = { animationDuration: 450, animationEasing: "ease-out" };

const fmtK = (n) =>
  Math.abs(n) >= 10000000
    ? `₹${(n / 10000000).toFixed(1)}Cr`
    : Math.abs(n) >= 100000
      ? `₹${(n / 100000).toFixed(0)}L`
      : Math.abs(n) >= 1000
        ? `₹${(n / 1000).toFixed(0)}K`
        : `₹${n || 0}`;

const tooltipProps = {
  formatter: (v) => formatCurrency(v),
  cursor: { fill: "var(--color-gray-100)" },
};

function ChartCard({ title, subtitle, children, extra, className = "" }) {
  return (
    <section className={`bg-white rounded-xl border border-gray-200 px-5 pt-4 pb-3 min-w-0 ${className}`}>
      <header className="mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-semibold text-gray-900">{title}</h3>
          {extra}
        </div>
        {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

export default function DashboardCharts({
  expenseByHead,
  expenseHeadMeta,
  monthlyTrend,
  ageingChartData,
  batchStatus,
  onDrillExpenseHead,
  onDrillAgeing,
  basisTag,
  attention,
}) {
  const { in: INFLOW, out: OUTFLOW } = useChartColors();
  const shown = expenseHeadMeta?.shownTotal;
  const grand = expenseHeadMeta?.grandTotal;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <ChartCard
          className="xl:col-span-2"
          title="Income vs expense"
          extra={basisTag}
          subtitle="Last 6 months, same accrual basis as the P&L above."
        >
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyTrend} barGap={2} barCategoryGap="28%" margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="month" axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtK} axisLine={false} tickLine={false} width={56} />
              <Tooltip {...tooltipProps} />
              <Legend iconType="circle" iconSize={8} align="right" verticalAlign="top" height={28} />
              <Bar dataKey="Income" fill={INFLOW} radius={[4, 4, 0, 0]} maxBarSize={28} {...ANIM} />
              <Bar dataKey="Expense" fill={OUTFLOW} radius={[4, 4, 0, 0]} maxBarSize={28} {...ANIM} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        {attention && <div className="min-w-0">{attention}</div>}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard
          title="Expense by head"
          extra={basisTag}
          subtitle={
            grand != null
              ? `Top 10 heads · ${formatCurrency(shown ?? 0)} of ${formatCurrency(grand)}`
              : "Top 10 heads, direct expenses + payables raised"
          }
        >
          {expenseByHead.length === 0 && batchStatus === "ready" ? (
            <p className="text-sm text-gray-500 py-20 text-center">No expenses in this period</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={expenseByHead} layout="vertical" barCategoryGap="22%" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" tickFormatter={fmtK} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" axisLine={false} tickLine={false} width={160} interval={0} />
                <Tooltip {...tooltipProps} />
                <Bar
                  dataKey="movement"
                  name="Expense"
                  radius={[0, 4, 4, 0]}
                  fill={OUTFLOW}
                  maxBarSize={18}
                  cursor="pointer"
                  onClick={(data) => onDrillExpenseHead?.(data.label, data.movement)}
                  {...ANIM}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Ageing" subtitle="Payables and receivables by days overdue. Opposing balances, shown side by side.">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={ageingChartData} barGap={2} barCategoryGap="30%" margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="bucket" axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtK} axisLine={false} tickLine={false} width={56} />
              <Tooltip {...tooltipProps} />
              <Legend iconType="circle" iconSize={8} align="right" verticalAlign="top" height={28} />
              <Bar
                dataKey="Receivables"
                fill={INFLOW}
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
                cursor="pointer"
                onClick={(data) => onDrillAgeing?.("receivables", data.bucket, data.Receivables)}
                {...ANIM}
              />
              <Bar
                dataKey="Payables"
                fill={OUTFLOW}
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
                cursor="pointer"
                onClick={(data) => onDrillAgeing?.("payables", data.bucket, data.Payables)}
                {...ANIM}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
