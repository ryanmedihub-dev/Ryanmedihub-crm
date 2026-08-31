"use client";

import { useEffect, useState, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import {
  OwnerTopbar, KpiRow, Card, Funnel, ProgressBar, Modal, DataTable,
  DrillSeam, ErrorState, EmptyState, AttentionRamp, Skeleton,
} from "@/components/owner";
import { ALL_BRANCHES } from "@/lib/branches";

const BRANCHES    = ["All", ...ALL_BRANCHES];
const DATE_RANGES = ["Today", "Yesterday", "Last 7 Days", "Last 30 Days", "Custom"];

const rupee = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);

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

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function buildRecommendations({ d, stalledBookingsCount, onOpenStalled }) {
  const recs = [];

  if (stalledBookingsCount > 0) {
    recs.push({
      id: "stalled-bookings",
      severity: "bad",
      title: `${stalledBookingsCount} patient${stalledBookingsCount === 1 ? "" : "s"} token-paid, no surgery date set in 14+ days`,
      detail: "Money already collected, nothing booked — a real conversion leak. Tap to see the list.",
      onClick: onOpenStalled,
    });
  }

  if ((d.visited || 0) >= 5) {
    const notConvertedPct = Math.round((d.notConverted / d.visited) * 100);
    if (notConvertedPct > 50) {
      recs.push({
        id: "not-converted-rate",
        severity: "warn",
        title: `${notConvertedPct}% of visited patients did not convert this period`,
        detail: `${fmt(d.notConverted)} of ${fmt(d.visited)} visited leads left without booking.`,
      });
    }
  }

  return recs;
}

const SEVERITY_LEVEL = { bad: 4, warn: 3, good: 1 };

export default function OwnerCommandCenter() {
  const [branch, setBranch]       = useState("All");
  const [dateRange, setDateRange] = useState("Today");
  const [custom, setCustom]       = useState({ from: "", to: "" });
  const [loading, setLoading]     = useState(true);
  const [data, setData]           = useState(null);
  const [error, setError]         = useState(null);

  const [finance, setFinance]               = useState(null);
  const [financeLoading, setFinanceLoading] = useState(true);

  const [stalledBookings, setStalledBookings]           = useState([]);
  const [stalledBookingsCount, setStalledBookingsCount] = useState(0);
  const [recLoading, setRecLoading]                     = useState(true);
  const [stalledModalOpen, setStalledModalOpen]         = useState(false);

  const [revenueSeamOpen, setRevenueSeamOpen] = useState(false);

  const fetchFinance = useCallback(async () => {
    setFinanceLoading(true);
    try {
      const bq = branch !== "All" ? `?branch=${encodeURIComponent(branch)}` : "";
      const [recRes, payRes] = await Promise.all([
        fetch(`/api/receivables/summary${bq}`),
        fetch(`/api/payables/summary${bq}`),
      ]);
      const [recJson, payJson] = await Promise.all([recRes.json(), payRes.json()]);
      setFinance({
        receivable: recJson.success ? recJson.overall : null,
        payable: payJson.success ? payJson.overall : null,
      });
    } catch {
      setFinance(null);
    } finally {
      setFinanceLoading(false);
    }
  }, [branch]);

  useEffect(() => { fetchFinance(); }, [fetchFinance]);

  const fetchData = useCallback(async () => {
    if (dateRange === "Custom" && !custom.from) return;
    setLoading(true);
    setError(null);
    try {
      const { from, to } = buildDateRange(dateRange, custom);
      const res  = await fetch("/api/super-admin/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch, from, to }),
      });
      const json = await res.json();
      if (json.success) setData(json);
      else setError(json.message || "Failed to load");
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }, [branch, dateRange, custom]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchRecommendations = useCallback(async () => {
    setRecLoading(true);
    try {
      const res = await fetch("/api/owner/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch }),
      });
      const json = await res.json();
      if (json.success) {
        setStalledBookings(json.stalledBookings || []);
        setStalledBookingsCount(json.stalledBookingsCount || 0);
      }
    } catch {
      setStalledBookings([]);
      setStalledBookingsCount(0);
    } finally {
      setRecLoading(false);
    }
  }, [branch]);

  useEffect(() => { fetchRecommendations(); }, [fetchRecommendations]);

  const d = data || {};

  const conversionPct = d.appointments > 0 ? Math.round((d.converted / d.appointments) * 100) : 0;

  const kpiLoading = loading || financeLoading;

  const kpiItems = [
    {
      label: "Total Revenue",
      value: loading ? "—" : rupee(d.totalAmount),
      sub: `${dateRange} · ${branch === "All" ? "All branches" : branch}`,
      kind: "good",
      onDrill: () => setRevenueSeamOpen((o) => !o),
      drillOpen: revenueSeamOpen,
    },
    { label: "Total Leads",         value: loading ? "—" : fmt(d.totalLeads),    sub: branch === "All" ? "All branches" : branch, kind: "info" },
    { label: "Conversion Rate",     value: loading ? "—" : `${conversionPct}%`,  sub: loading ? "" : `${fmt(d.converted)} of ${fmt(d.appointments)} appts`, kind: conversionPct >= 30 ? "good" : "warn" },
    { label: "Surgeries",           value: loading ? "—" : fmt(d.surgeries),     sub: "Completed", kind: "good" },
    { label: "Pending Receivable",  value: financeLoading ? "—" : rupee(finance?.receivable?.totalPending), sub: financeLoading ? "" : `${fmt(finance?.receivable?.count ?? 0)} open`, kind: "info" },
    { label: "Pending Payable",     value: financeLoading ? "—" : rupee(finance?.payable?.totalPending),    sub: financeLoading ? "" : `${fmt(finance?.payable?.count ?? 0)} open`,    kind: (finance?.payable?.totalPending > 0 ? "bad" : "good") },
  ];

  const funnelItems = [
    { label: "Leads",        value: d.totalLeads   || 0 },
    { label: "Appointments", value: d.appointments || 0 },
    { label: "Visited",      value: d.visited       || 0 },
    { label: "Converted",    value: d.converted     || 0 },
    { label: "Surgeries",    value: d.surgeries     || 0 },
  ];

  const alerts = [];
  if (!financeLoading && finance?.payable?.totalPending > 0) {
    alerts.push({
      id: "payable-pending",
      icon: "💸",
      title: `${rupee(finance.payable.totalPending)} payable pending`,
      detail: `${fmt(finance.payable.count || 0)} open payable(s) awaiting payment`,
    });
  }
  if (!financeLoading && finance?.receivable?.totalPending > 0) {
    alerts.push({
      id: "receivable-pending",
      icon: "🧾",
      title: `${rupee(finance.receivable.totalPending)} receivable pending`,
      detail: `${fmt(finance.receivable.count || 0)} open receivable(s) awaiting collection`,
    });
  }
  if (!loading && d.notConverted > 0) {
    alerts.push({
      id: "not-converted",
      icon: "⚠️",
      title: `${fmt(d.notConverted)} leads not converted`,
      detail: `Out of ${fmt(d.visited)} visited this period`,
    });
  }
  if (!loading && d.scheduledInterviews > 0) {
    alerts.push({
      id: "interviews-scheduled",
      icon: "🗓️",
      title: `${fmt(d.scheduledInterviews)} interviews scheduled`,
      detail: "Upcoming candidate interviews this period",
    });
  }

  const recommendations = recLoading
    ? []
    : buildRecommendations({ d, stalledBookingsCount, onOpenStalled: () => setStalledModalOpen(true) });

  const staffRows = Object.entries(d.staffBreakdown || {}).sort((a, b) => b[1] - a[1]);

  return (
    <div className="app">
      <OwnerSidebar />

      <div className="main">
        <OwnerTopbar
          title="Command Center"
          subtitle={`Real-time clinic pulse · ${branch === "All" ? "All branches" : branch}`}
          controls={
            <>
              <select className="control" value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Branch">
                {BRANCHES.map((b) => <option key={b}>{b}</option>)}
              </select>
              <select className="control" value={dateRange} onChange={(e) => setDateRange(e.target.value)} aria-label="Date range">
                {DATE_RANGES.map((r) => <option key={r}>{r}</option>)}
              </select>
              {dateRange === "Custom" && (
                <>
                  <input type="date" className="control" value={custom.from} onChange={(e) => setCustom((p) => ({ ...p, from: e.target.value }))} aria-label="From date" />
                  <input type="date" className="control" value={custom.to} onChange={(e) => setCustom((p) => ({ ...p, to: e.target.value }))} aria-label="To date" />
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
              <KpiRow items={kpiItems} primaryIndex={0} loading={kpiLoading} />

              <DrillSeam
                open={revenueSeamOpen && !loading}
                onClose={() => setRevenueSeamOpen(false)}
                title="Revenue behind the number"
                subtitle={`Per-day total · ${dateRange}${branch !== "All" ? ` · ${branch}` : ""}`}
              >
                <DataTable
                  columns={[
                    { key: "date", label: "Date", render: (r) => new Date(r.date).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" }) },
                    { key: "total", label: "Revenue", align: "right", render: (r) => rupee(r.total) },
                  ]}
                  rows={(d.perDay || []).map((r, i) => ({ ...r, id: i }))}
                  emptyMessage={<EmptyState icon="₹" title="No revenue in this period" hint="Pick a wider date range or a different branch." />}
                />
              </DrillSeam>

              <div className="grid cols-2">
                <Card title="Daily Revenue" subtitle={`${dateRange}${branch !== "All" ? ` · ${branch}` : ""}`}>
                  {loading ? (
                    <Skeleton variant="chart" />
                  ) : d.perDay && d.perDay.length > 0 ? (
                    <ResponsiveContainer width="100%" height={240}>
                      <AreaChart data={d.perDay} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="ownerRevGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="var(--info)" stopOpacity={0.22} />
                            <stop offset="95%" stopColor="var(--info)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tickFormatter={fmtDate}
                          tick={{ fontSize: 12, fill: "var(--ink-muted)" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tickFormatter={(v) => v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : `₹${(v / 1000).toFixed(0)}k`}
                          tick={{ fontSize: 12, fill: "var(--ink-muted)" }}
                          axisLine={false}
                          tickLine={false}
                          width={54}
                        />
                        <Tooltip
                          formatter={(v) => [rupee(v), "Revenue"]}
                          labelFormatter={(l) => new Date(l).toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long" })}
                          contentStyle={{ borderRadius: "12px", border: "1px solid var(--line)", fontSize: "13px", background: "var(--surface)", color: "var(--ink)" }}
                        />
                        <Area
                          type="monotone"
                          dataKey="total"
                          stroke="var(--info)"
                          strokeWidth={2.5}
                          fill="url(#ownerRevGrad)"
                          dot={{ r: 3, fill: "var(--info)", strokeWidth: 0 }}
                          activeDot={{ r: 5, fill: "var(--info)" }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState icon="₹" title="No revenue data for this period" hint="Try a wider date range." />
                  )}
                </Card>

                <Card title="Alerts" subtitle="Live operational flags">
                  {financeLoading || loading ? (
                    <Skeleton variant="row" count={4} style={{ height: 40, margin: "10px 0" }} />
                  ) : alerts.length === 0 ? (
                    <EmptyState icon="✓" title="All clear" hint="No operational flags right now." />
                  ) : (
                    <div className="alerts">
                      {alerts.map((a) => (
                        <div className="alert" key={a.id}>
                          <div className="alert-ico">{a.icon}</div>
                          <div>
                            <strong>{a.title}</strong>
                            <p>{a.detail}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>

              <div className="grid cols-3">
                <Card title="Conversion Funnel" subtitle="Leads → Surgeries">
                  {loading ? <Skeleton variant="chart" /> : <Funnel items={funnelItems} />}
                </Card>

                <Card title="Workforce Status" subtitle={loading ? "" : `${fmt(d.totalStaff)} active staff`}>
                  {loading ? (
                    <Skeleton variant="row" count={5} style={{ height: 18, margin: "12px 0" }} />
                  ) : staffRows.length === 0 ? (
                    <EmptyState icon="☰" title="No staff data" hint="Staff breakdown will show once roles are assigned." />
                  ) : (
                    staffRows.map(([role, count]) => (
                      <div className="metric-row" key={role}>
                        <span>{role}</span>
                        <ProgressBar value={d.totalStaff > 0 ? (count / d.totalStaff) * 100 : 0} />
                        <strong>{count}</strong>
                      </div>
                    ))
                  )}
                </Card>

                <Card title="Action Feed" subtitle="Rule-based, computed from live data">
                  {recLoading ? (
                    <Skeleton variant="row" count={2} style={{ height: 56, margin: "10px 0" }} />
                  ) : recommendations.length === 0 ? (
                    <EmptyState icon="✓" title="Nothing flagged" hint="No rule tripped for this branch right now." />
                  ) : (
                    recommendations.map((r) => (
                      <div
                        className={`decision-card ${r.severity}`}
                        key={r.id}
                        role={r.onClick ? "button" : undefined}
                        tabIndex={r.onClick ? 0 : undefined}
                        onClick={r.onClick}
                        onKeyDown={r.onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); r.onClick(); } } : undefined}
                        style={r.onClick ? { cursor: "pointer" } : undefined}
                      >
                        <AttentionRamp level={SEVERITY_LEVEL[r.severity] ?? 2} label={r.severity === "bad" ? "Critical" : r.severity === "warn" ? "Attention" : "Info"} />
                        <h4>{r.title}</h4>
                        <p>{r.detail}</p>
                      </div>
                    ))
                  )}
                </Card>
              </div>
            </>
          )}
        </div>
      </div>

      <Modal
        open={stalledModalOpen}
        onClose={() => setStalledModalOpen(false)}
        title="Stalled Bookings"
        subtitle="Token paid, no surgery date set, 14+ days since visit"
      >
        <DataTable
          columns={[
            { key: "name", label: "Patient" },
            { key: "phone", label: "Phone" },
            { key: "branch", label: "Branch" },
            { key: "visitDate", label: "Visit Date", render: (row) => row.visitDate ? new Date(row.visitDate).toLocaleDateString("en-IN") : "—" },
            { key: "daysWaiting", label: "Days Waiting", align: "right" },
            { key: "amountReceived", label: "Received", align: "right", render: (row) => rupee(row.amountReceived) },
            { key: "pendingAmount", label: "Pending", align: "right", render: (row) => rupee(row.pendingAmount) },
            { key: "status", label: "Status" },
          ]}
          rows={stalledBookings}
          emptyMessage="No stalled bookings"
        />
      </Modal>
    </div>
  );
}
