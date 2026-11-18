"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import HRSidebar from "@/components/Sidebars/HRSidebar";
import {
  Users, UserCheck, UserX, CalendarClock, PauseCircle,
  ClipboardList, QrCode, Globe,
  RefreshCw, ArrowRight,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell,
} from "recharts";

function buildRange(preset, custom = {}) {
  const now = new Date();
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  let start = new Date(now); start.setHours(0, 0, 0, 0);
  if (preset === "yesterday") {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1); end.setHours(23, 59, 59, 999);
  } else if (preset === "last7") {
    start.setDate(start.getDate() - 6);
  } else if (preset === "last30") {
    start.setDate(start.getDate() - 29);
  } else if (preset === "custom" && custom.from && custom.to) {
    const f = new Date(custom.from); f.setHours(0, 0, 0, 0);
    const t = new Date(custom.to);   t.setHours(23, 59, 59, 999);
    return { from: f.toISOString(), to: t.toISOString() };
  }
  return { from: start.toISOString(), to: end.toISOString() };
}

const fmtDay  = (d) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

const STATUS_COLORS = {
  Selected:              "#10b981",
  Rejected:              "#ef4444",
  "Interview Scheduled": "#6366f1",
  "On Hold":             "#f59e0b",
  Applied:               "#3b82f6",
};
const STATUS_BG = {
  Selected:              "bg-emerald-100 text-emerald-700",
  Rejected:              "bg-red-100 text-red-700",
  "Interview Scheduled": "bg-indigo-100 text-indigo-700",
  "On Hold":             "bg-amber-100 text-amber-700",
  Applied:               "bg-blue-100 text-blue-700",
};

function StatCard({ label, value, sub, accent, icon: Icon, href, pct, pctLabel }) {
  const styles = {
    violet: { bar: "bg-indigo-500", icon: "bg-indigo-50 text-indigo-600" },
    amber:  { bar: "bg-amber-500",  icon: "bg-amber-50 text-amber-600"  },
    indigo: { bar: "bg-indigo-500", icon: "bg-indigo-50 text-indigo-600" },
  };
  const s = styles[accent] || styles.violet;
  const inner = (
    <div className={`bg-white rounded-xl border border-gray-200 h-full transition-colors ${href ? "group-hover:border-gray-300 group-hover:bg-gray-50/60" : ""}`}>
      <div className="p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-gray-600">{label}</p>
          <div className={`w-8 h-8 rounded-lg ${s.icon} flex items-center justify-center`}>
            <Icon className="w-4 h-4" aria-hidden />
          </div>
        </div>
        <p className="mt-3 text-3xl font-semibold tracking-tight text-gray-900 tabular-nums leading-none">{value}</p>
        <div className="mt-2 flex items-center gap-2 text-xs">
          {sub && <span className="text-gray-500">{sub}</span>}
          {href && <ArrowRight className="ml-auto w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" aria-hidden />}
        </div>
        {pct !== undefined && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-gray-500 mb-1 tabular-nums">
              <span>{pctLabel}</span><span>{pct}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${s.bar}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
  return href ? <Link href={href} className="group block h-full rounded-xl">{inner}</Link> : inner;
}

function MiniKpi({ label, value, color }) {
  return (
    <div className="px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
        <span className={`w-1.5 h-1.5 rounded-full ${color}`} aria-hidden />
        {label}
      </p>
      <p className="text-xl font-semibold text-gray-900 tabular-nums mt-1">{value}</p>
    </div>
  );
}

const PRESETS = [
  { key: "today",     label: "Today"      },
  { key: "yesterday", label: "Yesterday"  },
  { key: "last7",     label: "Last 7 Days"},
  { key: "last30",    label: "Last 30 Days"},
  { key: "custom",    label: "Custom"     },
];

export default function HRDashboard() {
  const [preset, setPreset]   = useState("last30");
  const [custom, setCustom]   = useState({ from: "", to: "" });
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const range = buildRange(preset, custom);
      const res   = await fetch("/api/hr/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(range),
      });
      const json = await res.json();
      if (json.success) setData(json);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [preset, custom]);

  useEffect(() => {
    if (preset === "custom" && (!custom.from || !custom.to)) return;
    fetchData();
  }, [fetchData, preset, custom]);

  const total = data?.total ?? 0;
  const visitedPct = total > 0 ? Math.round(((data?.visitedCount ?? 0) / total) * 100) : 0;
  const appliedPct = total > 0 ? Math.round(((data?.appliedCount ?? 0) / total) * 100) : 0;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <HRSidebar />
      <main className="flex-1 flex flex-col min-w-0 overflow-auto">

        <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-lg font-semibold tracking-tight text-gray-900 leading-none">HR Dashboard</h1>
                <p className="text-xs text-gray-500 mt-0.5">Recruitment overview & analytics</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {PRESETS.map(({ key, label }) => (
                <button key={key} type="button" aria-pressed={preset === key} onClick={() => setPreset(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    preset === key
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300"
                  }`}>
                  {label}
                </button>
              ))}
              {preset === "custom" && (
                <div className="flex gap-1.5">
                  <input type="date" value={custom.from}
                    onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
                  <input type="date" value={custom.to}
                    onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
                </div>
              )}
              <button type="button" onClick={fetchData} disabled={loading} aria-label="Refresh" title="Refresh"
                className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-gray-300 transition-colors disabled:opacity-50">
                <RefreshCw className={`w-3.5 h-3.5 text-gray-600 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 p-5 lg:p-6 space-y-5 overflow-auto">

          {loading && !data ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-4 border-gray-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                  icon={Users} label="Total Candidates" value={data?.total ?? 0}
                  sub="All sources combined" accent="violet"
                  pct={100} pctLabel="All candidates"
                />
                <StatCard
                  icon={QrCode} label="Visited via QR" value={data?.visitedCount ?? 0}
                  sub="Physically came in" accent="amber" href="/hr/visited"
                  pct={visitedPct} pctLabel="of total"
                />
                <StatCard
                  icon={Globe} label="Applied Online" value={data?.appliedCount ?? 0}
                  sub="Applied via direct link" accent="indigo" href="/hr/applied"
                  pct={appliedPct} pctLabel="of total"
                />
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-5 bg-white rounded-xl border border-gray-200 divide-x divide-gray-100">
                <MiniKpi label="Applied"   value={data?.applied   ?? 0} color="bg-blue-500" />
                <MiniKpi label="Scheduled" value={data?.scheduled ?? 0} color="bg-indigo-500" />
                <MiniKpi label="Selected"  value={data?.selected  ?? 0} color="bg-emerald-500" />
                <MiniKpi label="Rejected"  value={data?.rejected  ?? 0} color="bg-red-500" />
                <MiniKpi label="On Hold"   value={data?.onHold    ?? 0} color="bg-amber-500" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-base font-semibold text-gray-900">Visited vs Applied — Daily Trend</h2>
                  </div>
                  {(data?.perDay?.filter(d => d.visited > 0 || d.applied > 0).length ?? 0) > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={data.perDay} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gVisited" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="gApplied" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize: 10, fill: "#9ca3af" }} />
                        <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} allowDecimals={false} />
                        <Tooltip labelFormatter={fmtDay} contentStyle={{ borderRadius: "10px", border: "1px solid #e5e7eb", fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Area type="monotone" dataKey="visited" name="Visited (QR)" stroke="#f59e0b" strokeWidth={2} fill="url(#gVisited)" dot={false} />
                        <Area type="monotone" dataKey="applied" name="Applied Online" stroke="#6366f1" strokeWidth={2} fill="url(#gApplied)" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-50 text-sm text-gray-400">No data for selected range</div>
                  )}
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h2 className="text-base font-semibold text-gray-900 mb-4">Status Breakdown</h2>
                  <div className="space-y-3">
                    {(data?.byStatus || []).map(({ _id, count }) => {
                      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                      return (
                        <div key={_id}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_BG[_id] || "bg-gray-100 text-gray-600"}`}>
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[_id] || "#6b7280" }} />
                              {_id || "Unknown"}
                            </span>
                            <span className="font-semibold text-gray-700">{count}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${pct}%`, backgroundColor: STATUS_COLORS[_id] || "#6b7280" }} />
                          </div>
                        </div>
                      );
                    })}
                    {!data?.byStatus?.length && <p className="text-sm text-gray-400 text-center py-8">No data</p>}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-base font-semibold text-gray-900">Positions Applied For</h2>
                  </div>
                  {(data?.positions?.length ?? 0) > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={data.positions.slice(0, 8)} layout="vertical" margin={{ left: 5, right: 15 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10, fill: "#9ca3af" }} allowDecimals={false} />
                        <YAxis dataKey="_id" type="category" tick={{ fontSize: 10, fill: "#374151" }} width={90} />
                        <Tooltip formatter={(v) => [v, "Applicants"]} contentStyle={{ borderRadius: "10px", border: "1px solid #e5e7eb", fontSize: 11 }} />
                        <Bar dataKey="count" fill="#3d50e0" radius={[0, 4, 4, 0]} maxBarSize={16} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-50 text-sm text-gray-400">No data for selected range</div>
                  )}
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-semibold text-gray-900">Recent Candidates</h2>
                    <Link href="/hr/candidates" className="text-xs text-indigo-600 font-semibold hover:underline flex items-center gap-1">
                      View all <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                  {(data?.recentCandidates?.length ?? 0) > 0 ? (
                    <div className="space-y-2.5">
                      {data.recentCandidates.map((c) => (
                        <div key={c._id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                            <span className="text-indigo-700 font-semibold text-[11px]">{c.name?.slice(0,2).toUpperCase()}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate leading-none">{c.name}</p>
                            <p className="text-xs text-gray-400 mt-0.5 truncate">{c.position || "—"}</p>
                          </div>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_BG[c.status] || "bg-gray-100 text-gray-600"}`}>
                            {c.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-50 text-sm text-gray-400">No candidates yet</div>
                  )}
                </div>
              </div>

              {(data?.byHr?.length ?? 0) > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                    <h2 className="text-base font-semibold text-gray-900">HR Performance</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          {["HR Name","Total","Scheduled","Selected","Rejected","On Hold","Conversion Rate"].map((h) => (
                            <th key={h} className={`px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide ${h === "HR Name" ? "text-left" : "text-center"}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {data.byHr.map((hr) => {
                          const conv = hr.total > 0 ? Math.round((hr.selected / hr.total) * 100) : 0;
                          return (
                            <tr key={hr._id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                                    <span className="text-indigo-700 font-semibold text-[11px]">{(hr._id || "?").slice(0,2).toUpperCase()}</span>
                                  </div>
                                  <span className="font-semibold text-gray-800 text-sm">{hr._id || "Unassigned"}</span>
                                </div>
                              </td>
                              {[hr.total, hr.scheduled, hr.selected, hr.rejected, hr.onHold].map((v, i) => (
                                <td key={i} className="px-4 py-3 text-center">
                                  <span className={`text-sm tabular-nums ${i === 0 ? "font-semibold text-gray-900" : "text-gray-700"}`}>{v}</span>
                                </td>
                              ))}
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2 justify-center">
                                  <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full ${conv >= 50 ? "bg-emerald-500" : conv >= 25 ? "bg-amber-400" : "bg-red-400"}`}
                                      style={{ width: `${conv}%` }} />
                                  </div>
                                  <span className="text-xs font-semibold text-gray-700 tabular-nums w-8">{conv}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
