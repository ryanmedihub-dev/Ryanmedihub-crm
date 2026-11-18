"use client";

import StatCard from "@/components/dashboard/StatCard";
import { useState, useEffect, useCallback, useRef } from "react";
import SuperAdminSidebar from "@/components/Sidebars/SuperAdminSidebar";
import {
  Users, UserCheck, UserX, Target, IndianRupee,
  Search, RefreshCw, Calendar, ChevronDown, ChevronLeft,
  ChevronRight, X, QrCode, Globe, Briefcase, Clock,
  CheckCircle2, XCircle, AlertCircle, Loader2, Eye,
  Phone, Mail, MapPin, Star, Building2,
} from "lucide-react";

const DATE_RANGES = ["Today", "Yesterday", "Last 7 Days", "Last 30 Days", "All Time", "Custom"];

const HR_STATUSES = [
  { value: "",                     label: "All Statuses" },
  { value: "Applied",              label: "Applied" },
  { value: "Interview Scheduled",  label: "Interview Scheduled" },
  { value: "Selected",             label: "Selected" },
  { value: "Rejected",             label: "Rejected" },
  { value: "On Hold",              label: "On Hold" },
];

const STATUS_META = {
  "Applied":             { color: "bg-indigo-100 text-indigo-700", dot: "bg-indigo-500",  icon: Clock       },
  "Interview Scheduled": { color: "bg-amber-100  text-amber-700",  dot: "bg-amber-500",   icon: Calendar    },
  "Selected":            { color: "bg-emerald-100 text-emerald-700",dot: "bg-emerald-500", icon: CheckCircle2},
  "Rejected":            { color: "bg-red-100    text-red-700",     dot: "bg-red-500",     icon: XCircle     },
  "On Hold":             { color: "bg-gray-100   text-gray-600",    dot: "bg-gray-400",    icon: AlertCircle },
};

const fmt    = (n) => new Intl.NumberFormat("en-IN").format(n || 0);
const fmtPay = (n) => n ? `₹${new Intl.NumberFormat("en-IN").format(n)}` : "—";

function buildDateRange(range, custom) {
  if (range === "All Time") return { from: null, to: null };
  const now = new Date();
  let from = new Date(), to = new Date();
  to.setHours(23, 59, 59, 999);
  if (range === "Today") {
    from.setHours(0, 0, 0, 0);
  } else if (range === "Yesterday") {
    from.setDate(from.getDate() - 1); from.setHours(0, 0, 0, 0);
    to = new Date(from); to.setHours(23, 59, 59, 999);
  } else if (range === "Last 7 Days") {
    from.setDate(from.getDate() - 6); from.setHours(0, 0, 0, 0);
  } else if (range === "Last 30 Days") {
    from.setDate(from.getDate() - 29); from.setHours(0, 0, 0, 0);
  } else if (range === "Custom" && custom.from) {
    from = new Date(custom.from); from.setHours(0, 0, 0, 0);
    to   = custom.to ? new Date(custom.to) : new Date(custom.from);
    to.setHours(23, 59, 59, 999);
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

const COLOR_MAP = {
  amber:  { accent: "bg-amber-500",   soft: "bg-amber-50",   text: "text-amber-600",   border: "border-amber-100"   },
  blue:   { accent: "bg-blue-500",    soft: "bg-blue-50",    text: "text-blue-600",    border: "border-blue-100"    },
  green:  { accent: "bg-emerald-500", soft: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-100" },
  red:    { accent: "bg-red-500",     soft: "bg-red-50",     text: "text-red-600",     border: "border-red-100"     },
  purple: { accent: "bg-indigo-500",  soft: "bg-purple-50",  text: "text-purple-600",  border: "border-purple-100"  },
  indigo: { accent: "bg-indigo-500",  soft: "bg-indigo-50",  text: "text-indigo-600",  border: "border-indigo-100"  },
  teal:   { accent: "bg-teal-500",    soft: "bg-teal-50",    text: "text-teal-600",    border: "border-teal-100"    },
};

function KpiCard({ title, value, subtitle, icon, color = "amber" }) {
  return <StatCard title={title} value={value} subtitle={subtitle} icon={icon} tone={color} />;
}

function CandidateModal({ candidate, onClose }) {
  if (!candidate) return null;
  const meta = STATUS_META[candidate.status] || STATUS_META["Applied"];
  const StatusIcon = meta.icon;

  const scoreFields = [
    { key: "communication",      label: "Communication"      },
    { key: "technicalKnowledge", label: "Technical Knowledge"},
    { key: "personality",        label: "Personality"        },
    { key: "motivation",         label: "Motivation"         },
    { key: "stability",          label: "Stability"          },
  ];
  const scores = scoreFields.filter((f) => candidate[f.key] != null);
  const avgScore = scores.length
    ? (scores.reduce((s, f) => s + candidate[f.key], 0) / scores.length).toFixed(1)
    : null;

  return (
    <div className="fixed inset-0 overlay-in bg-gray-950/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-100 flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-semibold text-xl shadow-md">
              {candidate.name?.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{candidate.name}</h2>
              <p className="text-sm text-gray-500">{candidate.position}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${meta.color}`}>
                  <StatusIcon className="w-3 h-3" />
                  {candidate.status}
                </span>
                <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
                  candidate.source === "qr"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-indigo-100 text-indigo-700"
                }`}>
                  {candidate.source === "qr" ? <><QrCode className="w-3 h-3" /> Visited (QR)</> : <><Globe className="w-3 h-3" /> Applied Online</>}
                </span>
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            {candidate.phone && (
              <div className="flex items-center gap-2.5 p-3 bg-gray-50 rounded-xl">
                <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                <div>
                  <p className="text-[11px] text-gray-400 uppercase tracking-wide">Phone</p>
                  <p className="text-sm font-semibold text-gray-900">{candidate.phone}</p>
                </div>
              </div>
            )}
            {candidate.email && (
              <div className="flex items-center gap-2.5 p-3 bg-gray-50 rounded-xl">
                <Mail className="w-4 h-4 text-gray-400 shrink-0" />
                <div>
                  <p className="text-[11px] text-gray-400 uppercase tracking-wide">Email</p>
                  <p className="text-sm font-semibold text-gray-900 truncate">{candidate.email}</p>
                </div>
              </div>
            )}
            {candidate.address && (
              <div className="flex items-center gap-2.5 p-3 bg-gray-50 rounded-xl col-span-2">
                <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                <div>
                  <p className="text-[11px] text-gray-400 uppercase tracking-wide">Address</p>
                  <p className="text-sm font-semibold text-gray-900">{candidate.address}</p>
                </div>
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-medium text-gray-500 mb-3">Experience & Salary</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Type",        value: candidate.experienceType || "—"           },
                { label: "Years",       value: candidate.yearsOfExperience ? `${candidate.yearsOfExperience} yrs` : "—" },
                { label: "Prev Salary", value: fmtPay(candidate.previousSalary)          },
                { label: "Expected",    value: fmtPay(candidate.expectedSalary)          },
                { label: "Final Salary",value: fmtPay(candidate.finalSalary), highlight: !!candidate.finalSalary },
              ].map((item) => (
                <div key={item.label} className={`p-3 rounded-xl text-center ${item.highlight ? "bg-emerald-50 border border-emerald-200" : "bg-gray-50"}`}>
                  <p className={`text-sm font-semibold ${item.highlight ? "text-emerald-700" : "text-gray-900"}`}>{item.value}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{item.label}</p>
                </div>
              ))}
              {candidate.previousCompany && (
                <div className="p-3 bg-gray-50 rounded-xl col-span-2 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-gray-400" />
                  <div>
                    <p className="text-[11px] text-gray-400">Previous Company</p>
                    <p className="text-sm font-semibold text-gray-900">{candidate.previousCompany}</p>
                    {candidate.previousPosition && <p className="text-xs text-gray-500">{candidate.previousPosition}</p>}
                  </div>
                </div>
              )}
            </div>
          </div>

          {scores.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-gray-500">Evaluation Scores</p>
                {avgScore && (
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-xl">
                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                    <span className="text-sm font-semibold text-amber-700">{avgScore}/10 avg</span>
                  </div>
                )}
              </div>
              <div className="space-y-2.5">
                {scores.map(({ key, label }) => {
                  const val = candidate[key];
                  return (
                    <div key={key}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium text-gray-700">{label}</span>
                        <span className="font-semibold text-gray-900">{val}/10</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{
                            width: `${val * 10}%`,
                            backgroundColor: val >= 7 ? "#10b981" : val >= 5 ? "#f59e0b" : "#ef4444",
                          }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {(candidate.hrComments || candidate.finalRemarks || candidate.reasonForLeaving) && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-3">Notes</p>
              <div className="space-y-2">
                {candidate.hrComments && (
                  <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                    <p className="text-[11px] font-semibold text-blue-600 uppercase mb-1">HR Comments</p>
                    <p className="text-sm text-gray-700">{candidate.hrComments}</p>
                  </div>
                )}
                {candidate.finalRemarks && (
                  <div className="p-3 bg-purple-50 rounded-xl border border-purple-100">
                    <p className="text-[11px] font-semibold text-purple-600 uppercase mb-1">Final Remarks</p>
                    <p className="text-sm text-gray-700">{candidate.finalRemarks}</p>
                  </div>
                )}
                {candidate.reasonForLeaving && (
                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                    <p className="text-[11px] font-semibold text-amber-600 uppercase mb-1">Reason for Leaving</p>
                    <p className="text-sm text-gray-700">{candidate.reasonForLeaving}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-xs text-gray-500">
            {candidate.interviewDate && (
              <div>
                <span className="font-semibold text-gray-700">Interview Date: </span>
                {new Date(candidate.interviewDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
              </div>
            )}
            {candidate.assignedHr?.name && (
              <div>
                <span className="font-semibold text-gray-700">Assigned HR: </span>
                {candidate.assignedHr.name}
              </div>
            )}
            {candidate.source && (
              <div>
                <span className="font-semibold text-gray-700">Source: </span>
                {candidate.source === "qr" ? "Visited via QR" : candidate.source === "direct" ? "Applied Online" : candidate.source}
              </div>
            )}
            <div>
              <span className="font-semibold text-gray-700">Applied On: </span>
              {new Date(candidate.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CandidateRow({ candidate, onView }) {
  const meta = STATUS_META[candidate.status] || STATUS_META["Applied"];
  const StatusIcon = meta.icon;
  const isQR = candidate.source === "qr";

  return (
    <tr className="hover:bg-gray-50 transition-colors group">
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-linear-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xs font-semibold shrink-0 shadow-sm">
            {candidate.name?.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{candidate.name}</p>
            <p className="text-xs text-gray-400 truncate">{candidate.email || candidate.phone}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3.5 text-sm text-gray-700">{candidate.position || "—"}</td>
      <td className="px-4 py-3.5">
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${meta.color}`}>
          <StatusIcon className="w-3 h-3" />
          {candidate.status}
        </span>
      </td>
      <td className="px-4 py-3.5">
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
          isQR ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-700"
        }`}>
          {isQR ? <QrCode className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
          {isQR ? "Visited" : "Applied"}
        </span>
      </td>
      <td className="px-4 py-3.5 text-sm text-gray-700">
        {candidate.experienceType || "—"}
        {candidate.yearsOfExperience ? ` · ${candidate.yearsOfExperience}y` : ""}
      </td>
      <td className="px-4 py-3.5 text-sm text-gray-700">{fmtPay(candidate.expectedSalary)}</td>
      <td className="px-4 py-3.5 text-sm font-semibold text-emerald-700">{fmtPay(candidate.finalSalary) || "—"}</td>
      <td className="px-4 py-3.5 text-xs text-gray-400">
        {new Date(candidate.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
      </td>
      <td className="px-4 py-3.5">
        <button aria-label="View" onClick={() => onView(candidate)}
          className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
          <Eye className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}

export default function InterviewsPage() {
  const [activeTab,  setActiveTab]  = useState("all");
  const [candidates, setCandidates] = useState([]);
  const [stats,      setStats]      = useState({});
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 25, pages: 1 });
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status,     setStatus]     = useState("");
  const [dateRange,  setDateRange]  = useState("Last 30 Days");
  const [custom,     setCustom]     = useState({ from: "", to: "" });
  const [selected,   setSelected]   = useState(null);
  const searchTimer = useRef(null);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  const sourceParam = activeTab === "visited" ? "qr" : activeTab === "applied" ? "direct" : "";

  const fetchCandidates = useCallback(async (page = 1) => {
    if (dateRange === "Custom" && !custom.from) return;
    setLoading(true);
    try {
      const { from, to } = buildDateRange(dateRange, custom);
      const params = new URLSearchParams({ page, limit: pagination.limit });
      if (sourceParam) params.append("source", sourceParam);
      if (status) params.append("status", status);
      if (from)   params.append("from", from);
      if (to)     params.append("to", to);
      if (debouncedSearch) params.append("search", debouncedSearch);

      const res  = await fetch(`/api/super-admin/interviews?${params}`);
      const json = await res.json();
      if (json.success) {
        setCandidates(json.candidates);
        setStats(json.stats || {});
        setPagination(json.pagination);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [sourceParam, status, dateRange, custom, debouncedSearch, pagination.limit]);

  useEffect(() => {
    fetchCandidates(1);
  }, [fetchCandidates]);

  const TABS = [
    { id: "all",     label: "All Candidates", icon: Users,     color: "text-gray-700"    },
    { id: "visited", label: "Visited (QR)",   icon: QrCode,    color: "text-amber-600"   },
    { id: "applied", label: "Applied Online", icon: Globe,     color: "text-indigo-600"  },
  ];

  return (
    <div className="flex min-h-screen bg-gray-50">
      <SuperAdminSidebar />

      <div className="flex-1 overflow-auto">
        <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-gray-900 leading-tight">Interview Candidates</h1>
                <p className="text-[11px] text-gray-400 mt-0.5">Applied online (direct) & Visited via QR (qr)</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <select value={dateRange} onChange={(e) => setDateRange(e.target.value)}
                  className="pl-7 pr-7 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 appearance-none cursor-pointer shadow-sm">
                  {DATE_RANGES.map((r) => <option key={r}>{r}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>

              {dateRange === "Custom" && (
                <>
                  <input type="date" value={custom.from}
                    onChange={(e) => setCustom((p) => ({ ...p, from: e.target.value }))}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/30 shadow-sm" />
                  <input type="date" value={custom.to} min={custom.from}
                    onChange={(e) => setCustom((p) => ({ ...p, to: e.target.value }))}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/30 shadow-sm" />
                </>
              )}

              <div className="relative">
                <select value={status} onChange={(e) => setStatus(e.target.value)}
                  className="pl-3 pr-7 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 appearance-none cursor-pointer shadow-sm">
                  {HR_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>

              <button aria-label="Refresh" onClick={() => fetchCandidates(1)} disabled={loading}
                className="w-9 h-9 flex items-center justify-center border border-gray-200 rounded-xl bg-white hover:bg-gray-50 shadow-sm transition-colors">
                <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            <KpiCard title="Total Candidates"   value={fmt(stats.total)}              icon={Users}     color="blue"   subtitle="Filtered" />
            <KpiCard title="Visited (QR)"       value={fmt(stats.visitedCount || 0)}  icon={QrCode}    color="amber"  subtitle="source: qr" />
            <KpiCard title="Applied Online"     value={fmt(stats.appliedCount || 0)}  icon={Globe}     color="indigo" subtitle="source: direct" />
            <KpiCard title="Selected"           value={fmt(stats.selected)}           icon={UserCheck} color="green"  subtitle="Hired" />
            <KpiCard title="Rejected"           value={fmt(stats.rejected)}           icon={UserX}     color="red"    subtitle="Not Hired" />
            <KpiCard title="Scheduled"          value={fmt(stats.scheduled)}          icon={Calendar}  color="purple" subtitle="Upcoming" />
            <KpiCard title="Selection Rate"
              value={stats.selectionRate ? `${stats.selectionRate}%` : "0%"}          icon={Target}    color="teal"   subtitle="Success" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div
              onClick={() => setActiveTab(activeTab === "visited" ? "all" : "visited")}
              className={`cursor-pointer rounded-2xl border-2 p-5 transition-all ${
                activeTab === "visited"
                  ? "border-amber-400 bg-amber-50 shadow-md"
                  : "border-gray-200 bg-white hover:border-amber-300 hover:shadow-sm"
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                  <QrCode className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm">Visited via QR</h3>
                  <p className="text-xs text-gray-500">Candidates who scanned QR and came in</p>
                </div>
                {activeTab === "visited" && (
                  <span className="ml-auto px-2 py-1 bg-amber-500 text-white text-[11px] font-semibold rounded-lg">Active</span>
                )}
              </div>
              <div className="flex items-end justify-between mt-1">
                <p className="text-2xl font-semibold tracking-tight text-amber-600">{fmt(stats.visitedCount || 0)}</p>
                {(stats.total > 0) && (
                  <span className="text-sm font-semibold text-amber-500 mb-1">
                    {Math.round(((stats.visitedCount || 0) / stats.total) * 100)}%
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">Click to filter by Visited (QR) candidates</p>
            </div>

            <div
              onClick={() => setActiveTab(activeTab === "applied" ? "all" : "applied")}
              className={`cursor-pointer rounded-2xl border-2 p-5 transition-all ${
                activeTab === "applied"
                  ? "border-indigo-400 bg-indigo-50 shadow-md"
                  : "border-gray-200 bg-white hover:border-indigo-300 hover:shadow-sm"
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                  <Globe className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm">Applied Online</h3>
                  <p className="text-xs text-gray-500">Candidates who applied via direct link</p>
                </div>
                {activeTab === "applied" && (
                  <span className="ml-auto px-2 py-1 bg-indigo-500 text-white text-[11px] font-semibold rounded-lg">Active</span>
                )}
              </div>
              <div className="flex items-end justify-between mt-1">
                <p className="text-2xl font-semibold tracking-tight text-gray-900 tabular-nums">{fmt(stats.appliedCount || 0)}</p>
                {(stats.total > 0) && (
                  <span className="text-sm font-semibold text-indigo-500 mb-1">
                    {Math.round(((stats.appliedCount || 0) / stats.total) * 100)}%
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">Click to filter by Applied Online candidates</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 border-b border-gray-100">
              <div className="flex gap-1">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;
                  return (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                        active
                          ? "bg-gray-900 text-white"
                          : "text-gray-600 hover:bg-gray-100"
                      }`}>
                      <Icon className="w-3.5 h-3.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, phone, position..."
                  className="pl-9 pr-8 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 w-64" />
                {search && (
                  <button aria-label="Clear search" onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              {loading ? (
                <div className="flex items-center justify-center py-24">
                  <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
                </div>
              ) : candidates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 gap-3">
                  <Users className="w-12 h-12 text-gray-200" />
                  <p className="text-sm text-gray-500 font-medium">No candidates found</p>
                  <p className="text-xs text-gray-400">Try changing the filters or date range</p>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {["Candidate", "Position", "Status", "Source", "Experience", "Expected", "Final Salary", "Date", ""].map((h) => (
                        <th key={h} className="px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {candidates.map((c) => (
                      <CandidateRow key={c._id} candidate={c} onView={setSelected} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {pagination.pages > 1 && (
              <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  Showing {((pagination.page - 1) * pagination.limit) + 1}–
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
                  <span className="font-semibold text-gray-900">{fmt(pagination.total)}</span> candidates
                </p>
                <div className="flex items-center gap-1">
                  <button aria-label="Previous page" onClick={() => fetchCandidates(pagination.page - 1)} disabled={pagination.page <= 1}
                    className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    <ChevronLeft className="w-4 h-4 text-gray-600" />
                  </button>
                  {[...Array(Math.min(pagination.pages, 5))].map((_, i) => {
                    const pg = i + 1;
                    return (
                      <button key={pg} onClick={() => fetchCandidates(pg)}
                        className={`w-8 h-8 rounded-lg text-xs font-semibold transition-all ${
                          pg === pagination.page ? "bg-amber-500 text-white" : "text-gray-600 hover:bg-gray-100"
                        }`}>
                        {pg}
                      </button>
                    );
                  })}
                  <button aria-label="Next page" onClick={() => fetchCandidates(pagination.page + 1)} disabled={pagination.page >= pagination.pages}
                    className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    <ChevronRight className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {selected && <CandidateModal candidate={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
