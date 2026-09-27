"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { formatCurrency } from "@/lib/financeUI";

const fmtK = (n) =>
  Math.abs(n) >= 100000
    ? `₹${(n / 100000).toFixed(1)}L`
    : Math.abs(n) >= 1000
      ? `₹${(n / 1000).toFixed(0)}K`
      : `₹${n || 0}`;

function ChartCard({ title, subtitle, children, extra }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        {extra}
      </div>
      {subtitle && <p className="text-xs text-gray-400 mb-3">{subtitle}</p>}
      {!subtitle && <div className="mb-2" />}
      {children}
    </div>
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
}) {
  const shown = expenseHeadMeta?.shownTotal;
  const grand = expenseHeadMeta?.grandTotal;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <ChartCard
        title="Expense by Head — Top 10"
        extra={basisTag}
        subtitle={
          grand != null
            ? `Direct expenses + payables raised — the same definition as the P&L Expense card. ${formatCurrency(shown ?? 0)} of ${formatCurrency(grand)} shown.`
            : "Direct expenses + payables raised — the same definition as the P&L Expense card."
        }
      >
        {expenseByHead.length === 0 && batchStatus === "ready" ? (
          <p className="text-sm text-gray-400 py-16 text-center">No data for this period</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={expenseByHead} layout="vertical" margin={{ left: 8, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
              <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={100} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Bar
                dataKey="movement"
                name="Expense"
                radius={[0, 6, 6, 0]}
                fill="#f43f5e"
                cursor="pointer"
                onClick={(data) => onDrillExpenseHead?.(data.label, data.movement)}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard
        title="Income vs Expense — Last 6 Months"
        extra={basisTag}
        subtitle="Same accrual P&L as the card above, month by month."
      >
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={monthlyTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v) => formatCurrency(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Income" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Expense" fill="#f43f5e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Ageing — Payables vs Receivables"
        subtitle="Side by side, not stacked — the two are opposing balances and don't sum."
      >
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={ageingChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="bucket" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v) => formatCurrency(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar
              dataKey="Payables"
              fill="#f97316"
              radius={[4, 4, 0, 0]}
              cursor="pointer"
              onClick={(data) => onDrillAgeing?.("payables", data.bucket, data.Payables)}
            />
            <Bar
              dataKey="Receivables"
              fill="#0ea5e9"
              radius={[4, 4, 0, 0]}
              cursor="pointer"
              onClick={(data) => onDrillAgeing?.("receivables", data.bucket, data.Receivables)}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
