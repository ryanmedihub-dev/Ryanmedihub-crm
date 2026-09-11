"use client";

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import EmptyState from "./EmptyState";

// Thin recharts wrapper for the Employee detail page's trend line (Owner Panel
// v2, Part 1). recharts is already an approved, kept dependency (Part 0 removed
// chart.js/react-chartjs-2, not this) — no new chart library.
export default function TrendChart({ data = [], dataKey = "value", label = "Value", height = 220 }) {
  if (!data.length) {
    return <EmptyState icon="📈" title="No trend data" hint="Nothing in this date range yet." />;
  }

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
          <XAxis dataKey="date" tick={{ fill: "var(--ink-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
          <YAxis tick={{ fill: "var(--ink-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--line)" }} tickLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--line-strong)", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "var(--ink)" }}
            formatter={(v) => [v, label]}
          />
          <Line type="monotone" dataKey={dataKey} stroke="var(--accent)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
