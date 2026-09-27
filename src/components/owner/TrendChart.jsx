"use client";

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import EmptyState from "./EmptyState";

function anomalyDot(highlightLabel) {
  const needle = (highlightLabel || "").toLowerCase();
  return (props) => {
    const { cx, cy, payload } = props;
    if (!needle || !String(payload.date).toLowerCase().split(/\s+/).some((w) => needle.includes(w) && w.length > 1)) return null;
    return <circle key={payload.date} cx={cx} cy={cy} r={5} fill="var(--ai-violet)" stroke="var(--ai-cyan)" strokeWidth={2} />;
  };
}

export default function TrendChart({ data = [], dataKey = "value", label = "Value", height = 220, stroke = "var(--accent)", glow = false, highlightLabel = "" }) {
  if (!data.length) {
    return <EmptyState icon="📈" title="No trend data" hint="Nothing in this date range yet." />;
  }

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          {glow && (
            <defs>
              <filter id="trendGlow" x="-20%" y="-40%" width="140%" height="180%">
                <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor={stroke} floodOpacity="0.5" />
              </filter>
            </defs>
          )}
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
          <XAxis dataKey="date" tick={{ fill: "var(--ink-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
          <YAxis tick={{ fill: "var(--ink-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--line)" }} tickLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--line-strong)", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "var(--ink)" }}
            formatter={(v) => [v, label]}
          />
          <Line type="monotone" dataKey={dataKey} stroke={stroke} strokeWidth={2} dot={highlightLabel ? anomalyDot(highlightLabel) : false} isAnimationActive filter={glow ? "url(#trendGlow)" : undefined} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
