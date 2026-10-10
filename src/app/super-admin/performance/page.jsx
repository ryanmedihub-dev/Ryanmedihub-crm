"use client";

import { useEffect, useState, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, FunnelChart, Funnel, LabelList,
} from "recharts";
import {
  TrendingUp, IndianRupee, Users, Activity, Stethoscope,
  HeartPulse, Briefcase, RefreshCw, Calendar, MapPin,
  ChevronDown, Crown, Target, Award, Zap, BarChart2,
  Megaphone, UserCheck, UserX, Scissors, CreditCard,
} from "lucide-react";
import SuperAdminSidebar from "@/components/Sidebars/SuperAdminSidebar";
import { ALL_BRANCHES } from "@/lib/branches";

const BRANCHES    = ["All", ...ALL_BRANCHES];
const DATE_RANGES = ["Today", "Yesterday", "Last 7 Days", "Last 30 Days", "Custom"];

const PALETTE = [
  "#f59e0b","#f97316","#ef4444","#8b5cf6",
  "#3b82f6","#10b981","#ec4899","#14b8a6","#6366f1","#a78bfa",
];

const BRANCH_COLORS = {
  Delhi:     "#f59e0b",
  Mumbai:    "#3b82f6",
  Hyderabad: "#10b981",
  Noida:     "#ec4899",
  Gurgaon:   "#8b5cf6",
  Unknown:   "#9ca3af",
};

const METHOD_META = {
  upi:     { label: "UPI",     color: "#6366f1", icon: "📲" },
  cash:    { label: "Cash",    color: "#10b981", icon: "💵" },
  card:    { label: "Card",    color: "#3b82f6", icon: "💳" },
  banking: { label: "Banking", color: "#8b5cf6", icon: "🏦" },
  bajaj_loan: { label: "Bajaj Loan", color: "#f97316", icon: "📄" },
  fibe_loan: { label: "Fibe Loan",   color: "#fb923c", icon: "📄" },
  hdfc_skin_bank_transfer: { label: "HDFC Skin Bank Transfer", color: "#0ea5e9", icon: "🏦" },
  hdfc_ryan_medihub_bank_transfer: { label: "HDFC Ryan Medihub Bank Transfer", color: "#0d9488", icon: "🏦" },
  icici_medihub_bank_transfer: { label: "ICICI Medihub Bank Transfer", color: "#e11d48", icon: "🏦" },
  other:   { label: "Other",   color: "#9ca3af", icon: "💰" },
};

const HR_STATUS_COLORS = {
  Applied:              "#6366f1",
  "Interview Scheduled":"#f59e0b",
  Selected:             "#10b981",
  Rejected:             "#ef4444",
  "On Hold":            "#9ca3af",
};

const rupee = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);
const fmt   = (n) => new Intl.NumberFormat("en-IN").format(n || 0);
const fmtK  = (n) => n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(0)}K` : `₹${n}`;
const fmtDate = (s) => {
  if (!s) return "";
  const d = new Date(s);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
};

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

const COLOR_MAP = {
  amber:  { accent: "bg-amber-500",   soft: "bg-amber-50",   text: "text-amber-600",  border: "border-amber-100"  },
  orange: { accent: "bg-orange-500",  soft: "bg-orange-50",  text: "text-orange-600", border: "border-orange-100" },
  blue:   { accent: "bg-blue-500",    soft: "bg-blue-50",    text: "text-blue-600",   border: "border-blue-100"   },
  green:  { accent: "bg-emerald-500", soft: "bg-emerald-50", text: "text-emerald-600",border: "border-emerald-100"},
  purple: { accent: "bg-purple-500",  soft: "bg-purple-50",  text: "text-purple-600", border: "border-purple-100" },
  red:    { accent: "bg-red-500",     soft: "bg-red-50",     text: "text-red-600",    border: "border-red-100"    },
  indigo: { accent: "bg-indigo-500",  soft: "bg-indigo-50",  text: "text-indigo-600", border: "border-indigo-100" },
  teal:   { accent: "bg-teal-500",    soft: "bg-teal-50",    text: "text-teal-600",   border: "border-teal-100"   },
};

function KpiCard({ title, value, subtitle, icon: Icon, color = "amber" }) {
  const c = COLOR_MAP[color];
  return (
    <div className={`bg-white rounded-2xl border ${c.border} shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden`}>
      <div className={`h-1 ${c.accent}`} />
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className={`w-9 h-9 rounded-xl ${c.soft} flex items-center justify-center`}>
            <Icon className={`w-4.5 h-4.5 ${c.text}`} />
          </div>
          <span className={`text-[10px] font-semibold uppercase tracking-widest ${c.text} opacity-70`}>{subtitle}</span>
        </div>
        <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
        <p className="text-xs font-medium text-gray-500 mt-1.5">{title}</p>
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, children, className = "", action }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden ${className}`}>
      <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, color = "text-amber-600", accent = "bg-amber-50" }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className={`w-7 h-7 rounded-lg ${accent} flex items-center justify-center`}>
        <Icon className={`w-3.5 h-3.5 ${color}`} />
      </div>
      <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">{title}</h2>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
}

function Skeleton({ className = "" }) {
  return <div className={`animate-pulse bg-gray-100 rounded-xl ${className}`} />;
}

function PageSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs">
      {label && <p className="font-semibold text-gray-700 mb-1.5">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-gray-500">{p.name}:</span>
          <span className="font-semibold text-gray-900">
            {formatter ? formatter(p.value, p.name) : fmt(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

const TABS = [
  { id: "overview",  label: "Overview",  icon: BarChart2   },
  { id: "patients",  label: "Patients",  icon: HeartPulse  },
  { id: "revenue",   label: "Revenue",   icon: IndianRupee },
  { id: "staff",     label: "Staff",     icon: Users       },
  { id: "surgery",   label: "Surgery",   icon: Stethoscope },
  { id: "hr",        label: "HR",        icon: Briefcase   },
];

export default function SuperAdminPerformancePage() {
  const [branch,    setBranch]    = useState("All");
  const [dateRange, setDateRange] = useState("Last 30 Days");
  const [custom,    setCustom]    = useState({ from: "", to: "" });
  const [activeTab, setActiveTab] = useState("overview");
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [data,      setData]      = useState(null);

  const fetchData = useCallback(async () => {
    if (dateRange === "Custom" && !custom.from) return;
    setLoading(true);
    setError(null);
    try {
      const { from, to } = buildDateRange(dateRange, custom);
      const res  = await fetch("/api/super-admin/performance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch, from, to }),
      });
      const json = await res.json();
      if (json.success) setData(json);
      else setError(json.message || "Failed to load performance data");
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }, [branch, dateRange, custom]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const d = data || {};

  const renderTab = () => {
    if (loading) return <PageSkeleton />;
    if (error) return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center">
          <Activity className="w-8 h-8 text-red-400" />
        </div>
        <p className="text-sm font-semibold text-gray-800">{error}</p>
        <button onClick={fetchData} className="text-xs font-semibold text-amber-600 hover:underline">
          Try again
        </button>
      </div>
    );
    if (!data) return null;

    switch (activeTab) {
      case "overview":  return <OverviewTab  data={d} />;
      case "patients":  return <PatientsTab  data={d} />;
      case "revenue":   return <RevenueTab   data={d} />;
      case "staff":     return <StaffTab     data={d} />;
      case "surgery":   return <SurgeryTab   data={d} />;
      case "hr":        return <HRTab        data={d} />;
      default: return null;
    }
  };

  return (
    <section className="flex min-h-screen bg-[#f8f9fc]">
      <SuperAdminSidebar />

      <main className="flex-1 flex flex-col min-w-0 overflow-auto">

        <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-linear-to-br from-amber-400 via-orange-500 to-red-500 flex items-center justify-center shadow-md">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold text-gray-900 leading-tight">Performance Analytics</h1>
                <p className="text-[11px] text-gray-400 mt-0.5">Charts & KPIs across all modules</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <select value={branch} onChange={(e) => setBranch(e.target.value)}
                  className="pl-7 pr-7 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 appearance-none cursor-pointer shadow-sm">
                  {BRANCHES.map((b) => <option key={b}>{b}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>

              <div className="relative">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <select value={dateRange} onChange={(e) => setDateRange(e.target.value)}
                  className="pl-7 pr-7 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 appearance-none cursor-pointer shadow-sm">
                  {DATE_RANGES.map((r) => <option key={r}>{r}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>

              {dateRange === "Custom" && (
                <>
                  <input type="date" value={custom.from}
                    onChange={(e) => setCustom((p) => ({ ...p, from: e.target.value }))}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-300 shadow-sm" />
                  <input type="date" value={custom.to} min={custom.from}
                    onChange={(e) => setCustom((p) => ({ ...p, to: e.target.value }))}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-300 shadow-sm" />
                </>
              )}

              <button onClick={fetchData} disabled={loading}
                className="w-9 h-9 flex items-center justify-center border border-gray-200 rounded-xl bg-white hover:bg-gray-50 shadow-sm transition-colors disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white border-b border-gray-200 px-6">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-all ${
                    active
                      ? "border-amber-500 text-amber-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}>
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 p-6 space-y-8">
          {renderTab()}
        </div>
      </main>
    </section>
  );
}

function OverviewTab({ data }) {
  const { summary = {}, patients = {}, revenue = {}, surgery = {}, hr = {} } = data;

  const funnel = patients.funnel || [];
  const revenueDaily = revenue.dailyTrend || [];
  const techData = surgery.techniques || [];
  const hrFunnel = hr.funnel || [];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard title="Total Revenue"   value={fmtK(summary.totalRevenue)}   icon={IndianRupee} color="green"  subtitle="Period" />
        <KpiCard title="Total Expenses"  value={fmtK(summary.totalExpenses)}  icon={IndianRupee} color="red"    subtitle="Period" />
        <KpiCard title="Net Profit"      value={fmtK(summary.netProfit)}      icon={TrendingUp}  color="amber"  subtitle="Period" />
        <KpiCard title="Total Surgeries" value={fmt(summary.totalSurgeries)}  icon={Scissors}    color="purple" subtitle="Period" />
        <KpiCard title="HR Candidates"   value={fmt(summary.totalHRCandidates)} icon={Briefcase} color="blue"   subtitle="Period" />
        <KpiCard title="HR Selected"     value={fmt(summary.hrSelected)}      icon={UserCheck}   color="teal"   subtitle="Hired" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Patient Journey Funnel" subtitle="Appointments → Surgeries">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={funnel} layout="vertical" margin={{ left: 16, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
              <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="stage" tick={{ fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} width={90} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Patients" radius={[0, 6, 6, 0]}>
                {funnel.map((_, i) => (
                  <Cell key={i} fill={["#f59e0b", "#f97316", "#10b981", "#8b5cf6"][i] || "#6366f1"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Revenue vs Expenses" subtitle="Daily trend">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={revenueDaily}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#10b981" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip formatter={(v) => fmtK(v)} />} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="revenue"  name="Revenue"  stroke="#10b981" fill="url(#revGrad)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" fill="url(#expGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <ChartCard title="Surgery Techniques" subtitle="By count">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={techData} dataKey="count" nameKey="technique" cx="50%" cy="50%" outerRadius={90} label={({ technique, percent }) => `${technique} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                {techData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [fmt(v), n]} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="HR Pipeline" subtitle="Candidate status distribution">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={hrFunnel} layout="vertical" margin={{ left: 8, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
              <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="status" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={115} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Candidates" radius={[0, 6, 6, 0]}>
                {hrFunnel.map((h) => <Cell key={h.status} fill={HR_STATUS_COLORS[h.status] || "#9ca3af"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Revenue by Branch" subtitle="Revenue vs Expenses">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={revenue.byBranch || []} margin={{ right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="branch" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip formatter={(v) => fmtK(v)} />} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="revenue"  name="Revenue"  fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function PatientsTab({ data }) {
  const { patients = {} } = data;
  const funnel    = patients.funnel    || [];
  const statusDist= patients.statusDist|| [];
  const daily     = patients.dailyTrend|| [];
  const byBranch  = patients.branchWise|| [];

  const totalPatients = funnel[0]?.count || 0;
  const surgeries     = funnel[3]?.count || 0;
  const converted     = funnel[2]?.count || 0;
  const visited       = funnel[1]?.count || 0;

  return (
    <div className="space-y-8">
      <SectionHeader icon={HeartPulse} title="Patient Performance" color="text-blue-600" accent="bg-blue-50" />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard title="Appointments"    value={fmt(totalPatients)} icon={Users}     color="blue"   subtitle="Period" />
        <KpiCard title="Visited"         value={fmt(visited)}       icon={UserCheck} color="green"  subtitle="Counselled" />
        <KpiCard title="Converted"       value={fmt(converted)}     icon={Target}    color="purple" subtitle="Ready" />
        <KpiCard title="Surgeries Done"  value={fmt(surgeries)}     icon={Scissors}  color="amber"  subtitle="Completed" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Patient Journey Funnel" subtitle="Stage-wise drop-off analysis">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={funnel} layout="vertical" margin={{ left: 16, right: 40 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
              <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="stage" tick={{ fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} width={95} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Patients" radius={[0, 6, 6, 0]} label={{ position: "right", fontSize: 11, fontWeight: 600, fill: "#374151" }}>
                {funnel.map((_, i) => (
                  <Cell key={i} fill={["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b"][i] || "#6366f1"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Patient Status Distribution" subtitle="Current pipeline breakdown">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={statusDist} dataKey="count" nameKey="status" cx="50%" cy="50%"
                innerRadius={60} outerRadius={100}
                paddingAngle={3}>
                {statusDist.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [fmt(v), n]} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Daily Patient Volume" subtitle="Appointments & conversions over time">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={daily}>
            <defs>
              <linearGradient id="patGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="convGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#10b981" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="patients"  name="Appointments" stroke="#3b82f6" fill="url(#patGrad)"  strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="converted" name="Converted"    stroke="#10b981" fill="url(#convGrad)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Branch-wise Patient Performance" subtitle="Total vs converted vs surgeries">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={byBranch}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="branch" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="total"     name="Appointments" fill="#3b82f6" radius={[4,4,0,0]} />
            <Bar dataKey="converted" name="Converted"    fill="#10b981" radius={[4,4,0,0]} />
            <Bar dataKey="surgeries" name="Surgeries"    fill="#f59e0b" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function RevenueTab({ data }) {
  const { revenue = {}, summary = {} } = data;
  const daily      = revenue.dailyTrend  || [];
  const byBranch   = revenue.byBranch    || [];
  const byProcedure= revenue.byProcedure || [];
  const byMethod   = revenue.byMethod    || [];
  const outstanding= revenue.outstanding || [];

  return (
    <div className="space-y-8">
      <SectionHeader icon={IndianRupee} title="Revenue Performance" color="text-emerald-600" accent="bg-emerald-50" />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard title="Total Revenue"  value={fmtK(summary.totalRevenue)}  icon={IndianRupee} color="green"  subtitle="Period" />
        <KpiCard title="Total Expenses" value={fmtK(summary.totalExpenses)} icon={IndianRupee} color="red"    subtitle="Period" />
        <KpiCard title="Net Profit"     value={fmtK(summary.netProfit)}     icon={TrendingUp}  color="amber"  subtitle="Period" />
        <KpiCard title="Profit Margin"
          value={summary.totalRevenue > 0 ? `${((summary.netProfit / summary.totalRevenue) * 100).toFixed(1)}%` : "0%"}
          icon={Target} color="purple" subtitle="Period" />
      </div>

      <ChartCard title="Daily Revenue & Expenses" subtitle="Full trend with net overlay">
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={daily}>
            <defs>
              <linearGradient id="rev2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="exp2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip formatter={(v) => fmtK(v)} />} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="revenue"  name="Revenue"  stroke="#10b981" fill="url(#rev2)" strokeWidth={2.5} dot={false} />
            <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" fill="url(#exp2)" strokeWidth={2}   dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Revenue by Branch" subtitle="Branch-wise comparison">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byBranch}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="branch" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip formatter={(v) => fmtK(v)} />} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="revenue"  name="Revenue"  radius={[4,4,0,0]}>
                {byBranch.map((b) => <Cell key={b.branch} fill={BRANCH_COLORS[b.branch] || "#6366f1"} />)}
              </Bar>
              <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Revenue by Procedure" subtitle="Top procedures">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byProcedure} layout="vertical" margin={{ left: 8, right: 40 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
              <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="procedure" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={100} />
              <Tooltip content={<CustomTooltip formatter={(v, n) => n === "amount" ? fmtK(v) : fmt(v)} />} />
              <Bar dataKey="amount" name="Revenue" radius={[0, 6, 6, 0]}
                label={{ position: "right", fontSize: 10, fontWeight: 600, fill: "#374151", formatter: fmtK }}>
                {byProcedure.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Revenue by Payment Method" subtitle="Collection channel breakdown">
          <div className="grid grid-cols-2 gap-3 mb-4">
            {byMethod.slice(0, 4).map((m) => {
              const meta = METHOD_META[m.method] || { label: m.method, color: "#9ca3af", icon: "💰" };
              const total = byMethod.reduce((s, x) => s + x.amount, 0);
              return (
                <div key={m.method} className="p-3 rounded-xl border border-gray-100 bg-gray-50">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-base">{meta.icon}</span>
                    <span className="text-xs font-semibold text-gray-700">{meta.label}</span>
                  </div>
                  <p className="text-sm font-bold text-gray-900">{fmtK(m.amount)}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{fmt(m.count)} txns · {total > 0 ? ((m.amount/total)*100).toFixed(0) : 0}%</p>
                  <div className="mt-2 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${total > 0 ? (m.amount/total)*100 : 0}%`, backgroundColor: meta.color }} />
                  </div>
                </div>
              );
            })}
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={byMethod} dataKey="amount" nameKey="method" cx="50%" cy="50%" outerRadius={70} label={({ method, percent }) => `${method} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={9}>
                {byMethod.map((m) => <Cell key={m.method} fill={METHOD_META[m.method]?.color || PALETTE[0]} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [fmtK(v), n]} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Outstanding Payments by Branch" subtitle="Pending vs received">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={outstanding}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="branch" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip formatter={(v) => fmtK(v)} />} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="received" name="Received" fill="#10b981" radius={[4,4,0,0]} />
              <Bar dataKey="pending"  name="Pending"  fill="#f97316" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function StaffTab({ data }) {
  const { staff = {} } = data;
  const counsellors  = staff.counsellors     || [];
  const agents       = staff.agents          || [];
  const doctors      = staff.doctors         || [];
  const roleDist     = staff.roleDistribution|| [];

  return (
    <div className="space-y-8">
      <SectionHeader icon={Users} title="Staff Performance" color="text-purple-600" accent="bg-purple-50" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <ChartCard title="Staff Role Distribution" subtitle="Active employees by role">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={roleDist} dataKey="count" nameKey="role" cx="50%" cy="50%"
                innerRadius={55} outerRadius={90} paddingAngle={3}
                label={({ role, percent }) => `${role} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                {roleDist.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [fmt(v), n]} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Counsellor Conversion Rate" subtitle="% of patients ready for surgery" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={counsellors} layout="vertical" margin={{ left: 8, right: 50 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
              <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={110} />
              <Tooltip content={<CustomTooltip formatter={(v, n) => n === "rate" ? `${v}%` : fmt(v)} />} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="rate"  name="Conversion %" fill="#8b5cf6" radius={[0,6,6,0]}
                label={{ position: "right", fontSize: 10, fontWeight: 600, fill: "#374151", formatter: (v) => `${v}%` }} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Counsellor Patient Volume" subtitle="Total patients counselled">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={counsellors} layout="vertical" margin={{ left: 8, right: 40 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
              <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={110} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="total"     name="Total"     fill="#8b5cf6" radius={[0,6,6,0]} />
              <Bar dataKey="converted" name="Converted" fill="#10b981" radius={[0,6,6,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Agent Referral Performance" subtitle="Referrals & conversions">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={agents} layout="vertical" margin={{ left: 8, right: 40 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
              <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={110} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="referrals" name="Referrals" fill="#3b82f6" radius={[0,6,6,0]} />
              <Bar dataKey="converted" name="Converted" fill="#f59e0b" radius={[0,6,6,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Doctor Surgery Performance" subtitle="Surgeries, grafts, and revenue">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={doctors}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="left"  tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="right" orientation="right" tickFormatter={fmtK} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip formatter={(v, n) => n === "Revenue" ? fmtK(v) : fmt(v)} />} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="left"  dataKey="surgeries"  name="Surgeries"   fill="#10b981" radius={[4,4,0,0]} />
            <Bar yAxisId="left"  dataKey="avgGrafts"  name="Avg Grafts"  fill="#f59e0b" radius={[4,4,0,0]} />
            <Bar yAxisId="right" dataKey="revenue"    name="Revenue"     fill="#8b5cf6" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Agent Revenue Generated" subtitle="Revenue from referred patients">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={agents}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip formatter={(v) => fmtK(v)} />} />
            <Bar dataKey="revenue" name="Revenue Generated" radius={[4,4,0,0]}>
              {agents.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function SurgeryTab({ data }) {
  const { surgery = {} } = data;
  const techniques = surgery.techniques || [];
  const daily      = surgery.dailyTrend || [];
  const byBranch   = surgery.byBranch   || [];

  const totalSurgeries = techniques.reduce((s, t) => s + t.count, 0);
  const totalGrafts    = techniques.reduce((s, t) => s + t.count * t.avgGrafts, 0);

  return (
    <div className="space-y-8">
      <SectionHeader icon={Stethoscope} title="Surgery Performance" color="text-purple-600" accent="bg-purple-50" />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard title="Total Surgeries"    value={fmt(totalSurgeries)}                  icon={Scissors}   color="purple" subtitle="Period" />
        <KpiCard title="Total Grafts"       value={fmt(Math.round(totalGrafts))}          icon={Activity}   color="amber"  subtitle="Implanted" />
        <KpiCard title="Avg Grafts"
          value={totalSurgeries > 0 ? fmt(Math.round(totalGrafts / totalSurgeries)) : 0} icon={Target}    color="blue"   subtitle="Per Surgery" />
        <KpiCard title="Techniques Used"    value={fmt(techniques.length)}                icon={Zap}        color="teal"   subtitle="Distinct" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Technique Distribution" subtitle="Surgery count per technique">
          <ResponsiveContainer width="100%" height={270}>
            <PieChart>
              <Pie data={techniques} dataKey="count" nameKey="technique"
                cx="50%" cy="50%" innerRadius={60} outerRadius={110} paddingAngle={4}
                label={({ technique, count, percent }) => `${technique} (${(percent*100).toFixed(0)}%)`}
                labelLine fontSize={10}>
                {techniques.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [fmt(v), n]} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Technique — Avg Grafts & Revenue" subtitle="Per-technique metrics">
          <ResponsiveContainer width="100%" height={270}>
            <BarChart data={techniques} margin={{ right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="technique" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left"  tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={fmtK} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip formatter={(v, n) => n === "Revenue" ? fmtK(v) : fmt(v)} />} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="left"  dataKey="avgGrafts" name="Avg Grafts" fill="#8b5cf6" radius={[4,4,0,0]} />
              <Bar yAxisId="right" dataKey="revenue"   name="Revenue"    fill="#f59e0b" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Daily Surgery Trend" subtitle="Surgery count & grafts over time">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={daily}>
            <defs>
              <linearGradient id="surgGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="graftGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="left"  tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            <Area yAxisId="left"  type="monotone" dataKey="count"  name="Surgeries" stroke="#8b5cf6" fill="url(#surgGrad)"  strokeWidth={2.5} dot={false} />
            <Area yAxisId="right" type="monotone" dataKey="grafts" name="Grafts"    stroke="#f59e0b" fill="url(#graftGrad)" strokeWidth={2}   dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Surgeries by Branch" subtitle="Volume per location">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={byBranch}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="branch" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="surgeries" name="Surgeries" radius={[6,6,0,0]}>
              {byBranch.map((b) => <Cell key={b.branch} fill={BRANCH_COLORS[b.branch] || "#6366f1"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function HRTab({ data }) {
  const { hr = {}, summary = {} } = data;
  const funnel        = hr.funnel        || [];
  const positions     = hr.positionWise  || [];
  const daily         = hr.dailyTrend    || [];
  const sourceSummary = hr.sourceSummary || { applied: {}, visited: {} };

  const appliedData = sourceSummary.applied || {};
  const visitedData = sourceSummary.visited || {};

  const totalApplied  = appliedData.count    || 0;
  const totalVisited  = visitedData.count    || 0;
  const totalCandidates = totalApplied + totalVisited;
  const selected      = funnel.find((h) => h.status === "Selected")?.count || 0;
  const rejected      = funnel.find((h) => h.status === "Rejected")?.count || 0;

  const sourceCompare = [
    {
      label:    "Applied Online",
      source:   "direct",
      count:    totalApplied,
      selected: appliedData.selected  || 0,
      rejected: appliedData.rejected  || 0,
      color:    "#6366f1",
    },
    {
      label:    "Visited (QR)",
      source:   "qr",
      count:    totalVisited,
      selected: visitedData.selected  || 0,
      rejected: visitedData.rejected  || 0,
      color:    "#f59e0b",
    },
  ];

  return (
    <div className="space-y-8">
      <SectionHeader icon={Briefcase} title="HR Performance" color="text-rose-600" accent="bg-rose-50" />

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <KpiCard title="Applied Online"  value={fmt(totalApplied)}  icon={Users}     color="indigo" subtitle="source: direct" />
        <KpiCard title="Visited (QR)"    value={fmt(totalVisited)}  icon={UserCheck} color="amber"  subtitle="source: qr" />
        <KpiCard title="Total Candidates"value={fmt(totalCandidates)}icon={Users}    color="blue"   subtitle="Period" />
        <KpiCard title="Selected"        value={fmt(selected)}      icon={UserCheck} color="green"  subtitle="Hired" />
        <KpiCard title="Rejected"        value={fmt(rejected)}      icon={UserX}     color="red"    subtitle="Not Hired" />
        <KpiCard title="Visit→Hire Rate"
          value={totalVisited > 0 ? `${((visitedData.selected || 0) / totalVisited * 100).toFixed(1)}%` : "0%"}
          icon={Target} color="teal" subtitle="QR → Selected" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {sourceCompare.map((s) => (
          <div key={s.source} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
              <h3 className="font-semibold text-gray-900 text-sm">{s.label}</h3>
              <span className="ml-auto text-2xl font-bold text-gray-900">{fmt(s.count)}</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: "Total",    value: s.count,    color: "text-gray-900" },
                { label: "Selected", value: s.selected, color: "text-emerald-600" },
                { label: "Rejected", value: s.rejected, color: "text-red-500" },
              ].map((item) => (
                <div key={item.label} className="p-2 rounded-xl bg-gray-50">
                  <p className={`text-lg font-bold ${item.color}`}>{fmt(item.value)}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{item.label}</p>
                </div>
              ))}
            </div>
            {s.count > 0 && (
              <div className="mt-3">
                <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                  <span>Selection rate</span>
                  <span className="font-semibold text-emerald-600">
                    {((s.selected / s.count) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden flex gap-0.5">
                  <div className="h-full bg-emerald-500 rounded-l-full transition-all"
                    style={{ width: `${(s.selected / s.count) * 100}%` }} />
                  <div className="h-full bg-red-400 transition-all"
                    style={{ width: `${(s.rejected / s.count) * 100}%` }} />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Status Funnel — Applied vs Visited" subtitle="Each status broken down by source">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={funnel} layout="vertical" margin={{ left: 8, right: 40 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
              <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="status" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={130} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="applied" name="Applied Online" fill="#6366f1" radius={[0, 0, 0, 0]} stackId="a" />
              <Bar dataKey="visited" name="Visited (QR)"   fill="#f59e0b" radius={[0, 6, 6, 0]} stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Overall Status Distribution" subtitle="Donut — all candidates">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={funnel.filter((h) => h.count > 0)} dataKey="count" nameKey="status"
                cx="50%" cy="50%" innerRadius={60} outerRadius={110} paddingAngle={4}
                label={({ status, percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                {funnel.map((h) => <Cell key={h.status} fill={HR_STATUS_COLORS[h.status] || "#9ca3af"} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [fmt(v), n]} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Position-wise: Applied Online vs Visited (QR) vs Selected" subtitle="Per-position breakdown by source">
        <ResponsiveContainer width="100%" height={Math.max(260, positions.length * 48)}>
          <BarChart data={positions} layout="vertical" margin={{ left: 8, right: 50 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
            <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="position" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={130} />
            <Tooltip content={<CustomTooltip />} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="applied"  name="Applied Online" fill="#6366f1" radius={[0,0,0,0]} />
            <Bar dataKey="visited"  name="Visited (QR)"   fill="#f59e0b" radius={[0,0,0,0]} />
            <Bar dataKey="selected" name="Selected"       fill="#10b981" radius={[0,6,6,0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Daily HR Activity" subtitle="Applied online vs visited (QR scan) vs selected">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={daily}>
            <defs>
              <linearGradient id="applGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="visitGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="selGrad2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#10b981" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="applied"  name="Applied Online" stroke="#6366f1" fill="url(#applGrad)"  strokeWidth={2}   dot={false} />
            <Area type="monotone" dataKey="visited"  name="Visited (QR)"   stroke="#f59e0b" fill="url(#visitGrad)" strokeWidth={2}   dot={false} />
            <Area type="monotone" dataKey="selected" name="Selected"        stroke="#10b981" fill="url(#selGrad2)"  strokeWidth={2.5} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Selection Rate by Position" subtitle="% selected from all candidates">
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={positions.map((p) => ({
              ...p,
              rate: p.total > 0 ? +((p.selected / p.total) * 100).toFixed(1) : 0,
            }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="position" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip formatter={(v) => `${v}%`} />} />
              <Bar dataKey="rate" name="Selection Rate %" radius={[6,6,0,0]}
                label={{ position: "top", fontSize: 10, fontWeight: 600, fill: "#374151", formatter: (v) => `${v}%` }}>
                {positions.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Visit Rate by Position" subtitle="% who visited (QR) out of all candidates">
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={positions.map((p) => ({
              ...p,
              visitRate: p.total > 0 ? +((p.visited / p.total) * 100).toFixed(1) : 0,
            }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="position" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip formatter={(v) => `${v}%`} />} />
              <Bar dataKey="visitRate" name="Visit Rate %" radius={[6,6,0,0]}
                label={{ position: "top", fontSize: 10, fontWeight: 600, fill: "#374151", formatter: (v) => `${v}%` }}>
                {positions.map((_, i) => <Cell key={i} fill={["#f59e0b","#f97316","#ef4444","#8b5cf6"][i % 4]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
